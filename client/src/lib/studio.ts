export type StudioTool = "brush" | "water" | "road" | "river" | "build" | "erase" | "select";
export type StudioCell = { terrain: string; object?: string; color: string };

export const STUDIO_COLUMNS = 24;
export const STUDIO_ROWS = 16;
export const STUDIO_TILE_SIZE = 16;

const COLORS: Record<string, string> = { grass: "#415e55", forest: "#29443d", water: "#28566e", road: "#806b5c" };

export function createStudioMap(): StudioCell[] {
  return Array.from({ length: STUDIO_COLUMNS * STUDIO_ROWS }, (_, index) => {
    const x = index % STUDIO_COLUMNS; const y = Math.floor(index / STUDIO_COLUMNS);
    const forest = x > 15 && y < 8; const water = x < 4 || (x > 8 && x < 11 && y > 4 && y < 13);
    return { terrain: water ? "water" : forest ? "forest" : "grass", color: water ? COLORS.water : forest ? COLORS.forest : COLORS.grass };
  });
}

export function applyStudioTool(cells: StudioCell[], index: number, tool: StudioTool): StudioCell[] {
  if (tool === "select") return cells;
  const next = [...cells];
  if (tool === "erase" || tool === "brush") next[index] = { terrain: "grass", color: COLORS.grass };
  if (tool === "water" || tool === "river") next[index] = { terrain: "water", color: COLORS.water };
  if (tool === "road") next[index] = { terrain: "road", color: COLORS.road };
  if (tool === "build") next[index] = { ...next[index], object: "shrine" };
  return next;
}

export function clampStudioZoom(value: number) { return Math.min(1.55, Math.max(0.65, Number(value.toFixed(2)))); }
export function studioCellCoordinate(index: number) { return { x: index % STUDIO_COLUMNS, y: Math.floor(index / STUDIO_COLUMNS) }; }
export function canEditStudioLayer(layer: string, locked: Record<string, boolean>) { return locked[layer] !== true; }
export function studioArchitectLayer(mode: "World" | "Paint" | "Build" | "Scene" | "Logic"): "terrain" | "assets" | "lore" | "preview" { return mode === "Paint" ? "terrain" : mode === "Build" ? "assets" : mode === "Logic" ? "lore" : "preview"; }
export function snapStudioCellIndex(index: number, snapToGrid: boolean) { return snapToGrid ? Math.round(index) : index; }
export function resolveStudioPointerIndex(index: number, offsetX: number, offsetY: number, cellSize: number, snapToGrid: boolean) { if (snapToGrid) return index; const x = index % STUDIO_COLUMNS; const y = Math.floor(index / STUDIO_COLUMNS); const nextX = offsetX > cellSize * 0.75 ? x + 1 : offsetX < cellSize * 0.25 ? x - 1 : x; const nextY = offsetY > cellSize * 0.75 ? y + 1 : offsetY < cellSize * 0.25 ? y - 1 : y; return Math.max(0, Math.min(STUDIO_COLUMNS * STUDIO_ROWS - 1, nextY * STUDIO_COLUMNS + nextX)); }
export function studioProposalTransition(status: "pending" | "applied" | "rejected", action: "stage" | "apply" | "reject") { if (action === "apply" && status === "pending") return "applied" as const; if (action === "reject" && status === "pending") return "rejected" as const; return status; }
export function buildStudioScope(mode: "World" | "Paint" | "Build" | "Scene" | "Logic") { return { layer: studioArchitectLayer(mode), bounds: { x: 0, y: 0, width: STUDIO_COLUMNS, height: STUDIO_ROWS } }; }
export const studioModes = ["World", "Paint", "Build", "Scene", "Logic"] as const;
export function runStudioDraftChecks(cells: StudioCell[]) { const issues: string[] = []; if (!cells.some(cell => cell.object === "npc")) issues.push("No NPC spawn found in the current draft."); if (!cells.some(cell => cell.object === "boss")) issues.push("No encounter anchor found in the current draft."); if (!cells.some(cell => cell.terrain === "water")) issues.push("No water or river cells found in the current draft."); return issues; }
export function pushStudioHistory(history: string[], entry: string, limit = 8) { return [entry, ...history].slice(0, limit); }
