import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { getDb, getForgeSnapshot, getSettings } from "./db";
import { encryptSecret } from "./crypto";
import { validateWorldPlan } from "./worldArchitect";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getForgeSnapshot: vi.fn(),
  getSettings: vi.fn(),
  aiProposals: {},
  assetPacks: {},
  mapBlueprints: {},
  qaFindings: {},
  userSettings: {},
  worldRecords: {},
}));

const user = { id: 7, openId: "procedure-user", role: "user", name: "Director", email: null, loginMethod: "test", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const ctx = { user, req: { protocol: "https", headers: {} } as any, res: {} as any } as any;

function dbDouble(proposalStatus: "pending" | "applied" | "rejected") {
  const updates: unknown[] = [];
  const inserts: unknown[] = [];
  return {
    updates, inserts,
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 22, userId: 7, status: proposalStatus, proposalType: "map", content: "A safe proposal" }] }) }) }),
    update: () => ({ set: (value: unknown) => ({ where: async () => { updates.push(value); } }) }),
    insert: () => ({ values: (value: unknown) => { inserts.push(value); return { onDuplicateKeyUpdate: async () => undefined }; } }),
  };
}

describe("Forge router procedures", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.JWT_SECRET = "test-secret-for-world-forge"; });

  it("returns the canonical snapshot through the protected procedure", async () => {
    vi.mocked(getForgeSnapshot).mockResolvedValue({ records: [], packs: [], blueprints: [], findings: [], proposals: [] } as any);
    const result = await appRouter.createCaller(ctx).forge.snapshot();
    expect(result.records).toEqual([]);
    expect(getForgeSnapshot).toHaveBeenCalledWith(7);
  });

  it("returns explicit QA findings through the protected procedure", async () => {
    vi.mocked(getForgeSnapshot).mockResolvedValue({ records: [], packs: [], blueprints: [], findings: [], proposals: [] } as any);
    const result = await appRouter.createCaller(ctx).forge.qa();
    expect(result[0]).toMatchObject({ category: "world-bible", severity: "info" });
  });

  it("creates a validated World Architect plan and keeps it pending", async () => {
    vi.mocked(getSettings).mockResolvedValue({ geminiApiKeyEncrypted: encryptSecret("AIzaSyExampleKeyThatIsLongEnough123456") } as any);
    vi.mocked(getForgeSnapshot).mockResolvedValue({ records: [{ title: "Homelands" }], packs: [], blueprints: [], findings: [], proposals: [{ status: "applied", content: "River remains east" }] } as any);
    const db: any = { insert: () => ({ values: () => ({ 0: { insertId: 91 }, onDuplicateKeyUpdate: async () => undefined }) }) };
    vi.mocked(getDb).mockResolvedValue(db);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ schemaVersion: "shadow-essence.world-plan.v1", intent: "Build a cursed forest", scope: { layer: "terrain", bounds: { x: 0, y: 0, width: 30, height: 24 } }, operations: [{ id: "forest-floor", kind: "add_terrain", layer: "terrain", target: { point: { x: 16, y: 16 } }, data: { biome: "cursed_forest" }, reason: "The command requests a cursed forest", dependencies: [] }], memoryWrites: [], qaChecks: ["Check shrine approach"] }) }] } }] }) }));
    const result = await appRouter.createCaller(ctx).forge.architectPlan({ command: "Create a cursed forest around an ancient shrine", scope: { layer: "terrain", bounds: { x: 0, y: 0, width: 30, height: 24 } } });
    expect(result).toMatchObject({ proposalId: 91, status: "pending", validation: { valid: true } });
    vi.unstubAllGlobals();
  });

  it("saves a Gemini key and exposes only safe status data", async () => {
    const db = dbDouble("pending"); vi.mocked(getDb).mockResolvedValue(db as any);
    await expect(appRouter.createCaller(ctx).forge.saveGeminiKey({ apiKey: "AIzaSyExampleKeyThatIsLongEnough123456" })).resolves.toEqual({ configured: true, status: "untested" });
    expect(db.inserts).toHaveLength(1);
    vi.mocked(getSettings).mockResolvedValue({ geminiApiKeyEncrypted: encryptSecret("AIzaSyExampleKeyThatIsLongEnough123456"), geminiKeyStatus: "valid", geminiKeyLastTestedAt: null } as any);
    await expect(appRouter.createCaller(ctx).forge.geminiStatus()).resolves.toMatchObject({ configured: true, status: "valid", maskedKey: "configured" });
  });

  it("records valid and invalid Gemini test transitions without returning the key", async () => {
    vi.mocked(getSettings).mockResolvedValue({ geminiApiKeyEncrypted: encryptSecret("AIzaSyExampleKeyThatIsLongEnough123456"), geminiKeyStatus: "untested" } as any);
    const db = dbDouble("pending"); vi.mocked(getDb).mockResolvedValue(db as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "READY" }] } }] }) }));
    await expect(appRouter.createCaller(ctx).forge.testGemini()).resolves.toEqual({ status: "valid" });
    expect(db.updates).toContainEqual(expect.objectContaining({ geminiKeyStatus: "valid" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(appRouter.createCaller(ctx).forge.testGemini()).rejects.toThrow("Gemini request failed (401)");
    expect(db.updates).toContainEqual(expect.objectContaining({ geminiKeyStatus: "invalid" }));
    vi.unstubAllGlobals();
  });

  it("applies only a pending validated World Architect plan", async () => {
    const plan = { schemaVersion: "shadow-essence.world-plan.v1", intent: "Add forest floor", scope: { layer: "terrain", bounds: { x: 0, y: 0, width: 20, height: 20 } }, operations: [{ id: "forest-floor", kind: "add_terrain", layer: "terrain", target: { point: { x: 0, y: 0 } }, data: {}, reason: "Requested forest floor", dependencies: [] }], memoryWrites: [], qaChecks: [] };
    vi.mocked(getForgeSnapshot).mockResolvedValue({ records: [], packs: [], blueprints: [], findings: [], proposals: [] } as any);
    const pendingDb: any = { inserts: [], updates: [], select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 44, userId: 7, status: "pending", content: JSON.stringify(plan) }] }) }) }), insert: () => ({ values: async (value: unknown) => { pendingDb.inserts.push(value); } }), update: () => ({ set: (value: unknown) => ({ where: async () => { pendingDb.updates.push(value); } }) }) };
    vi.mocked(getDb).mockResolvedValue(pendingDb);
    await expect(appRouter.createCaller(ctx).forge.applyArchitectPlan({ id: 44 })).resolves.toMatchObject({ success: true, appliedOperations: 1 });
    expect(pendingDb.inserts).toHaveLength(1);
    const appliedDb = { ...pendingDb, select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 44, userId: 7, status: "applied", content: JSON.stringify(plan) }] }) }) }) };
    vi.mocked(getDb).mockResolvedValue(appliedDb as any);
    await expect(appRouter.createCaller(ctx).forge.applyArchitectPlan({ id: 44 })).rejects.toThrow("Only pending world plans can be applied");
  });

  it("rejects a pending World Architect plan without creating canonical records", async () => {
    const rejectedDb: any = { updates: [], inserts: [], select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 55, userId: 7, status: "pending", proposalType: "map", content: "structured plan" }] }) }) }), update: () => ({ set: (value: unknown) => ({ where: async () => { rejectedDb.updates.push(value); } }) }), insert: () => ({ values: async (value: unknown) => { rejectedDb.inserts.push(value); } }) };
    vi.mocked(getDb).mockResolvedValue(rejectedDb);
    await expect(appRouter.createCaller(ctx).forge.rejectProposal({ id: 55 })).resolves.toEqual({ success: true });
    expect(rejectedDb.updates).toContainEqual(expect.objectContaining({ status: "rejected" }));
    expect(rejectedDb.inserts).toHaveLength(0);
  });

  it("rejects World Architect plans with missing canonical blueprint, region, asset, or record references", () => {
    const plan: any = { schemaVersion: "shadow-essence.world-plan.v1", intent: "Reference canonical data", scope: { blueprintId: 99, regionId: 88, layer: "assets", bounds: { x: 0, y: 0, width: 20, height: 20 } }, operations: [{ id: "bad-reference", kind: "add_asset", layer: "assets", target: { point: { x: 0, y: 0 }, assetId: 77 }, data: { recordId: 66, locationId: 55 }, reason: "Test missing references", dependencies: [] }], memoryWrites: [], qaChecks: [] };
    const result = validateWorldPlan(plan, 16, { recordIds: new Set([1]), assetIds: new Set([2]), blueprintIds: new Set([3]) });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(5);
    expect(result.errors).toContain("Selected blueprint 99 does not exist in the canonical workspace.");
    expect(result.errors).toContain("Selected region 88 does not exist in the canonical world bible.");
    expect(result.errors).toContain("bad-reference: referenced asset 77 does not exist in the asset library.");
    expect(result.errors).toContain("bad-reference: referenced canonical record 66 does not exist.");
    expect(result.errors).toContain("bad-reference: referenced canonical record 55 does not exist.");
  });

  it("applies a pending proposal and rejects non-pending proposals", async () => {
    const pendingDb = dbDouble("pending"); vi.mocked(getDb).mockResolvedValue(pendingDb as any);
    await expect(appRouter.createCaller(ctx).forge.applyProposal({ id: 22 })).resolves.toEqual({ success: true });
    expect(pendingDb.inserts).toHaveLength(1);

    const appliedDb = dbDouble("applied"); vi.mocked(getDb).mockResolvedValue(appliedDb as any);
    await expect(appRouter.createCaller(ctx).forge.applyProposal({ id: 22 })).rejects.toThrow("Only pending proposals can be applied");

    const rejectedDb = dbDouble("rejected"); vi.mocked(getDb).mockResolvedValue(rejectedDb as any);
    await expect(appRouter.createCaller(ctx).forge.rejectProposal({ id: 22 })).resolves.toEqual({ success: true });
  });
});
