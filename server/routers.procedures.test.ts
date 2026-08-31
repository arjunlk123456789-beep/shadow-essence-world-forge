import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { getDb, getForgeSnapshot, getSettings } from "./db";
import { encryptSecret } from "./crypto";

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
