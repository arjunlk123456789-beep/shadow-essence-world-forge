import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, aiProposals, assetPacks, mapBlueprints, qaFindings, userSettings, users, worldRecords } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb(); if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (['name', 'email', 'loginMethod'] as const).forEach(field => { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; } });
  values.lastSignedIn = user.lastSignedIn ?? new Date(); updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0];
}

export async function getForgeSnapshot(userId: number) {
  const db = await getDb(); if (!db) return { records: [], packs: [], blueprints: [], findings: [], proposals: [], settings: null };
  const [records, packs, blueprints, findings, proposals, settings] = await Promise.all([
    db.select().from(worldRecords).where(eq(worldRecords.userId, userId)).orderBy(desc(worldRecords.updatedAt)),
    db.select().from(assetPacks).where(eq(assetPacks.userId, userId)).orderBy(desc(assetPacks.createdAt)),
    db.select().from(mapBlueprints).where(eq(mapBlueprints.userId, userId)).orderBy(desc(mapBlueprints.updatedAt)),
    db.select().from(qaFindings).where(and(eq(qaFindings.userId, userId), eq(qaFindings.resolved, 0))).orderBy(desc(qaFindings.createdAt)),
    db.select().from(aiProposals).where(eq(aiProposals.userId, userId)).orderBy(desc(aiProposals.createdAt)),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  ]);
  return { records, packs, blueprints, findings, proposals, settings: settings[0] ?? null };
}

export async function getSettings(userId: number) {
  const db = await getDb(); if (!db) return null;
  const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1); return result[0] ?? null;
}

export { aiProposals, assetPacks, mapBlueprints, qaFindings, userSettings, worldRecords };
