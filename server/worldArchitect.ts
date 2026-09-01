import { z } from "zod";

export const operationKinds = ["add_terrain", "add_asset", "add_lore", "add_npc", "add_connection", "add_road", "add_river", "remove_object", "set_biome", "set_preview"] as const;
export const operationLayers = ["terrain", "assets", "lore", "npcs", "connections", "preview"] as const;

const pointSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });
const boundsSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() });

export const worldOperationSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(operationKinds),
  layer: z.enum(operationLayers),
  target: z.object({ point: pointSchema.optional(), bounds: boundsSchema.optional(), assetId: z.number().int().positive().optional() }),
  data: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().min(1).max(500),
  dependencies: z.array(z.string()).default([]),
});

export const worldPlanSchema = z.object({
  schemaVersion: z.literal("shadow-essence.world-plan.v1"),
  intent: z.string().min(1).max(500),
  scope: z.object({ blueprintId: z.number().int().positive().optional(), regionId: z.number().int().positive().optional(), layer: z.enum(operationLayers), bounds: boundsSchema }),
  operations: z.array(worldOperationSchema).max(80),
  memoryWrites: z.array(z.object({ key: z.string().min(1).max(120), value: z.string().min(1).max(500) })).max(20).default([]),
  qaChecks: z.array(z.string().min(1).max(240)).max(30).default([]),
});

export type WorldPlan = z.infer<typeof worldPlanSchema>;
export type WorldOperation = z.infer<typeof worldOperationSchema>;

export function architectJsonSchema() {
  return {
    type: "OBJECT",
    properties: {
      schemaVersion: { type: "STRING", enum: ["shadow-essence.world-plan.v1"] },
      intent: { type: "STRING" },
      scope: { type: "OBJECT", properties: { blueprintId: { type: "INTEGER" }, regionId: { type: "INTEGER" }, layer: { type: "STRING", enum: operationLayers }, bounds: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, width: { type: "INTEGER" }, height: { type: "INTEGER" } }, required: ["x", "y", "width", "height"] } }, required: ["layer", "bounds"] },
      operations: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, kind: { type: "STRING", enum: operationKinds }, layer: { type: "STRING", enum: operationLayers }, target: { type: "OBJECT", properties: { point: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" } }, required: ["x", "y"] }, bounds: { type: "OBJECT", properties: { x: { type: "INTEGER" }, y: { type: "INTEGER" }, width: { type: "INTEGER" }, height: { type: "INTEGER" } }, required: ["x", "y", "width", "height"] }, assetId: { type: "INTEGER" } } }, data: { type: "OBJECT" }, reason: { type: "STRING" }, dependencies: { type: "ARRAY", items: { type: "STRING" } } }, required: ["id", "kind", "layer", "target", "data", "reason", "dependencies"] } },
      memoryWrites: { type: "ARRAY", items: { type: "OBJECT", properties: { key: { type: "STRING" }, value: { type: "STRING" } }, required: ["key", "value"] } },
      qaChecks: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["schemaVersion", "intent", "scope", "operations", "memoryWrites", "qaChecks"],
  };
}

function inside(point: { x: number; y: number }, bounds: { x: number; y: number; width: number; height: number }) {
  return point.x >= bounds.x && point.y >= bounds.y && point.x < bounds.x + bounds.width && point.y < bounds.y + bounds.height;
}

export function validateWorldPlan(plan: WorldPlan, tileSize = 16, refs?: { recordIds?: Set<number>; assetIds?: Set<number>; blueprintIds?: Set<number> }) {
  const errors: string[] = [];
  if (plan.scope.blueprintId && refs?.blueprintIds && !refs.blueprintIds.has(plan.scope.blueprintId)) errors.push(`Selected blueprint ${plan.scope.blueprintId} does not exist in the canonical workspace.`);
  if (plan.scope.regionId && refs?.recordIds && !refs.recordIds.has(plan.scope.regionId)) errors.push(`Selected region ${plan.scope.regionId} does not exist in the canonical world bible.`);
  if (plan.scope.bounds.x % 1 !== 0 || plan.scope.bounds.y % 1 !== 0) errors.push("Scope origin must be aligned to map cells.");
  for (const operation of plan.operations) {
    if (operation.layer !== plan.scope.layer && plan.scope.layer !== "preview") errors.push(`${operation.id}: operation layer is outside the selected editor layer.`);
    if (operation.target.point && !inside(operation.target.point, plan.scope.bounds)) errors.push(`${operation.id}: point target is outside the selected scope.`);
    if (operation.target.bounds) {
      const b = operation.target.bounds;
      const within = b.x >= plan.scope.bounds.x && b.y >= plan.scope.bounds.y && b.x + b.width <= plan.scope.bounds.x + plan.scope.bounds.width && b.y + b.height <= plan.scope.bounds.y + plan.scope.bounds.height;
      if (!within) errors.push(`${operation.id}: bounds target is outside the selected scope.`);
    }
    const pixelWidth = typeof operation.data.pixelWidth === "number" ? operation.data.pixelWidth : null;
    const pixelHeight = typeof operation.data.pixelHeight === "number" ? operation.data.pixelHeight : null;
    if ((pixelWidth !== null && pixelWidth % tileSize !== 0) || (pixelHeight !== null && pixelHeight % tileSize !== 0)) errors.push(`${operation.id}: sprite pixel dimensions must align to the ${tileSize}×${tileSize} asset grid.`);
    if (operation.kind === "add_asset" && !operation.target.assetId && !operation.data.assetName) errors.push(`${operation.id}: asset operations require assetId or assetName.`);
    if (operation.target.assetId && refs?.assetIds && !refs.assetIds.has(operation.target.assetId)) errors.push(`${operation.id}: referenced asset ${operation.target.assetId} does not exist in the asset library.`);
    for (const key of ["recordId", "locationId"] as const) { const id = operation.data[key]; if (typeof id === "number" && refs?.recordIds && !refs.recordIds.has(id)) errors.push(`${operation.id}: referenced canonical record ${id} does not exist.`); }
  }
  return { valid: errors.length === 0, errors };
}

export function buildArchitectPrompt(input: { command: string; scope: WorldPlan["scope"]; canon: unknown; previousDecisions: unknown }) {
  return `You are the Exercise Shadows AI World Architect. Translate the director's command into a safe structured world plan. Never output code, markdown, or arbitrary database operations. Use only the allowed schema. Respect the selected scope exactly; do not edit outside it. Preserve canonical lore and previously approved decisions. Every operation must be explainable and remain a proposal until human approval. The map grid is 16×16 pixels.\n\nCOMMAND:\n${input.command}\n\nSELECTED SCOPE:\n${JSON.stringify(input.scope)}\n\nCANONICAL WORLD BIBLE:\n${JSON.stringify(input.canon)}\n\nPREVIOUS APPROVED DECISIONS:\n${JSON.stringify(input.previousDecisions)}\n\nReturn one JSON object matching schemaVersion shadow-essence.world-plan.v1. Include concise QA checks and memoryWrites only for durable world decisions explicitly implied by the command.`;
}
