import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const worldRecords = mysqlTable("world_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  status: mysqlEnum("status", ["canonical", "draft", "archived"]).default("canonical").notNull(),
  summary: text("summary"),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const assetPacks = mysqlTable("asset_packs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  tileSize: int("tileSize").default(16).notNull(),
  sourceUrl: text("sourceUrl"),
  analysis: text("analysis").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const mapBlueprints = mysqlTable("map_blueprints", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  biome: varchar("biome", { length: 80 }).notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  payload: text("payload").notNull(),
  connectionIds: varchar("connectionIds", { length: 1000 }).notNull().default("[]"),
  exportFormat: varchar("exportFormat", { length: 20 }).notNull().default("tmx"),
  tilesetName: varchar("tilesetName", { length: 120 }).notNull().default("shadow-essence-16px"),
  status: mysqlEnum("status", ["draft", "ready", "exported"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const qaFindings = mysqlTable("qa_findings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  message: text("message").notNull(),
  recordId: int("recordId"),
  resolved: int("resolved").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aiProposals = mysqlTable("ai_proposals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  proposalType: varchar("proposalType", { length: 40 }).notNull(),
  prompt: text("prompt").notNull(),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["pending", "applied", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
});

export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  geminiApiKeyEncrypted: text("geminiApiKeyEncrypted"),
  geminiKeyLastTestedAt: timestamp("geminiKeyLastTestedAt"),
  geminiKeyStatus: mysqlEnum("geminiKeyStatus", ["not_configured", "untested", "valid", "invalid"]).default("not_configured").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type WorldRecord = typeof worldRecords.$inferSelect;
export type AssetPack = typeof assetPacks.$inferSelect;
export type MapBlueprint = typeof mapBlueprints.$inferSelect;
export type AiProposal = typeof aiProposals.$inferSelect;
