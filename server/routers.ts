import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { encryptSecret, decryptSecret, maskSecret } from "./crypto";
import { aiProposals, assetPacks, getDb, getForgeSnapshot, getSettings, mapBlueprints, qaFindings, userSettings, worldRecords } from "./db";
import { eq } from "drizzle-orm";
import { validateWorld } from "./qa";
import { canApplyProposal, statusAfterGeminiTest, statusAfterKeySave } from "./workflow";

const proposalType = z.enum(["map", "lore", "asset"]);

async function callGemini(key: string, prompt: string) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + encodeURIComponent(key), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35, maxOutputTokens: 1800 } }),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map(part => part.text ?? "").join("\n").trim() || "Gemini returned no proposal.";
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  forge: router({
    snapshot: protectedProcedure.query(({ ctx }) => getForgeSnapshot(ctx.user.id)),
    createRecord: protectedProcedure.input(z.object({ kind: z.string().min(2), title: z.string().min(2), summary: z.string().optional(), payload: z.record(z.string(), z.unknown()).default({}) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.insert(worldRecords).values({ userId: ctx.user.id, kind: input.kind, title: input.title, summary: input.summary, payload: JSON.stringify(input.payload), status: "canonical" });
      return { success: true };
    }),
    createBlueprint: protectedProcedure.input(z.object({ name: z.string().min(2), biome: z.string().min(2), width: z.number().int().positive(), height: z.number().int().positive(), connectionIds: z.array(z.number().int().positive()).default([]), exportFormat: z.enum(["tmx", "json"]).default("tmx"), tilesetName: z.string().min(2).max(120).default("shadow-essence-16px"), payload: z.record(z.string(), z.unknown()).default({}) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.insert(mapBlueprints).values({ userId: ctx.user.id, name: input.name, biome: input.biome, width: input.width, height: input.height, connectionIds: JSON.stringify(input.connectionIds), exportFormat: input.exportFormat, tilesetName: input.tilesetName, payload: JSON.stringify(input.payload), status: "draft" }); return { success: true };
    }),
    addAssetPack: protectedProcedure.input(z.object({ name: z.string().min(2), tileSize: z.number().int().positive().default(16), analysis: z.record(z.string(), z.unknown()).default({}), zipData: z.string().optional(), fileName: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      if (input.zipData && input.zipData.length > 14_000_000) throw new Error("ZIP is too large for this first-pass importer. Use a pack under 10 MB.");
      let sourceUrl: string | undefined;
      if (input.zipData) {
        const bytes = Buffer.from(input.zipData, "base64");
        const stored = await storagePut(`${ctx.user.id}-asset-packs/${Date.now()}-${input.fileName || "assets.zip"}`, bytes, "application/zip");
        sourceUrl = stored.url;
      }
      let manifestSummary: Record<string, unknown> = {};
      const rawManifest = typeof input.analysis.manifestData === "string" ? input.analysis.manifestData : null;
      if (rawManifest) {
        try {
          const parsed = JSON.parse(rawManifest) as { summary?: Record<string, unknown>; assets?: Array<{ size?: { width?: number; height?: number }; footprint_cells?: { width?: number; height?: number } }> };
          const assets = Array.isArray(parsed.assets) ? parsed.assets : [];
          manifestSummary = { spriteCount: assets.length, manifestSummary: parsed.summary ?? null, footprints: assets.slice(0, 500).map(asset => ({ size: asset.size ?? null, footprint_cells: asset.footprint_cells ?? null })) };
        } catch { manifestSummary = { manifestError: "The optional manifest could not be parsed; pack metadata was still retained." }; }
      }
      await db.insert(assetPacks).values({ userId: ctx.user.id, name: input.name, tileSize: input.tileSize, sourceUrl, analysis: JSON.stringify({ ...input.analysis, ...manifestSummary, imported: Boolean(input.zipData), fileName: input.fileName ?? null, importedAt: new Date().toISOString() }) }); return { success: true, sourceUrl, manifestSummary };
    }),
    qa: protectedProcedure.query(async ({ ctx }) => {
      const snapshot = await getForgeSnapshot(ctx.user.id);
      const derived = validateWorld(snapshot.records, snapshot.packs, snapshot.blueprints);
      return [...snapshot.findings.map(item => ({ severity: item.severity, category: item.category, message: item.message })), ...(snapshot.records.length === 0 ? [{ severity: "info" as const, category: "world-bible", message: "Create the first canonical region or location record to start the world graph." }] : []), ...derived];
    }),
    proposals: protectedProcedure.query(({ ctx }) => getForgeSnapshot(ctx.user.id).then(snapshot => snapshot.proposals)),
    generateProposal: protectedProcedure.input(z.object({ type: proposalType, prompt: z.string().min(10), context: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const settings = await getSettings(ctx.user.id);
      const key = settings?.geminiApiKeyEncrypted ? decryptSecret(settings.geminiApiKeyEncrypted) : null;
      if (!key) throw new Error("Configure a Gemini API key in Settings before requesting a proposal.");
      const prompt = `You are the Shadow Essence World Director. Produce a careful proposal for a canonical game-world project. Do not claim that anything has been applied. Type: ${input.type}. User request: ${input.prompt}. Existing context: ${input.context ?? "No additional context."}. Return a concise, structured proposal with sections: Intent, Proposed changes, Dependencies, QA considerations, and Approval notes.`;
      const content = await callGemini(key, prompt);
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const result = await db.insert(aiProposals).values({ userId: ctx.user.id, proposalType: input.type, prompt: input.prompt, content, status: "pending" });
      return { id: Number(result[0].insertId), content, status: "pending" as const };
    }),
    applyProposal: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const rows = await db.select().from(aiProposals).where(eq(aiProposals.id, input.id)).limit(1); const proposal = rows[0];
      if (!proposal || proposal.userId !== ctx.user.id) throw new Error("Proposal not found");
      if (!canApplyProposal(proposal.status)) throw new Error("Only pending proposals can be applied");
      await db.update(aiProposals).set({ status: "applied", reviewedAt: new Date() }).where(eq(aiProposals.id, input.id));
      await db.insert(worldRecords).values({ userId: ctx.user.id, kind: `ai-${proposal.proposalType}`, title: `Approved ${proposal.proposalType} proposal`, summary: "Applied from an approved AI proposal.", payload: JSON.stringify({ proposalId: proposal.id, content: proposal.content }) });
      return { success: true };
    }),
    rejectProposal: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.update(aiProposals).set({ status: "rejected", reviewedAt: new Date() }).where(eq(aiProposals.id, input.id)); return { success: true };
    }),
    geminiStatus: protectedProcedure.query(async ({ ctx }) => { const settings = await getSettings(ctx.user.id); return { configured: Boolean(settings?.geminiApiKeyEncrypted), status: settings?.geminiKeyStatus ?? "not_configured", maskedKey: settings?.geminiApiKeyEncrypted ? "configured" : null, lastTestedAt: settings?.geminiKeyLastTestedAt ?? null }; }),
    saveGeminiKey: protectedProcedure.input(z.object({ apiKey: z.string().min(20) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const encrypted = encryptSecret(input.apiKey.trim());
      await db.insert(userSettings).values({ userId: ctx.user.id, geminiApiKeyEncrypted: encrypted, geminiKeyStatus: statusAfterKeySave() }).onDuplicateKeyUpdate({ set: { geminiApiKeyEncrypted: encrypted, geminiKeyStatus: statusAfterKeySave() } });
      return { configured: true, status: "untested" as const };
    }),
    testGemini: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const settings = await getSettings(ctx.user.id); const key = settings?.geminiApiKeyEncrypted ? decryptSecret(settings.geminiApiKeyEncrypted) : null;
      if (!key) throw new Error("No Gemini API key is configured.");
      try { await callGemini(key, "Reply with exactly the word READY."); await db.update(userSettings).set({ geminiKeyStatus: statusAfterGeminiTest(true), geminiKeyLastTestedAt: new Date() }).where(eq(userSettings.userId, ctx.user.id)); return { status: statusAfterGeminiTest(true) }; }
      catch (error) { await db.update(userSettings).set({ geminiKeyStatus: statusAfterGeminiTest(false), geminiKeyLastTestedAt: new Date() }).where(eq(userSettings.userId, ctx.user.id)); throw new Error(error instanceof Error ? error.message : "Gemini test failed"); }
    }),
  }),
});

export type AppRouter = typeof appRouter;
