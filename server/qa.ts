type RecordRow = { kind: string };
type PackRow = { id: number; tileSize: number };
type BlueprintRow = { payload: string; connectionIds?: string };

export function validateWorld(records: RecordRow[], packs: PackRow[], blueprints: BlueprintRow[]) {
  const findings: Array<{ severity: "info" | "warning" | "critical"; category: string; message: string }> = [];
  const locations = records.filter(record => record.kind === "location");
  const lore = records.filter(record => record.kind === "lore");
  for (const blueprint of blueprints) {
    let payload: { connections?: string; assetPackId?: number | null; requirements?: string[] } = {};
    try { payload = JSON.parse(blueprint.payload || "{}"); } catch { findings.push({ severity: "critical", category: "blueprint", message: "A blueprint contains invalid JSON and cannot be exported." }); continue; }
    const connections = payload.connections?.split("→").map(part => part.trim()).filter(Boolean) ?? [];
    if (connections.length < 2) findings.push({ severity: "warning", category: "map-links", message: "A blueprint connection must identify both an exit and its destination." });
    let linkedIds: number[] = [];
    try { linkedIds = JSON.parse(blueprint.connectionIds || "[]"); } catch { findings.push({ severity: "critical", category: "map-links", message: "A blueprint has invalid canonical location link data." }); }
    const locationIds = new Set((records as Array<RecordRow & { id?: number }>).filter(record => record.kind === "location").map(record => record.id));
    const missingIds = linkedIds.filter(id => !locationIds.has(id));
    if (missingIds.length > 0) findings.push({ severity: "critical", category: "map-links", message: `Blueprint references missing canonical location IDs: ${missingIds.join(", ")}.` });
    if (payload.assetPackId && !packs.some(pack => pack.id === payload.assetPackId)) findings.push({ severity: "critical", category: "assets", message: "A blueprint references an asset pack that is not in the library." });
    if (payload.requirements?.includes("Lore clue") && lore.length === 0) findings.push({ severity: "warning", category: "lore", message: "A blueprint requires a lore clue, but no canonical lore record exists." });
  }
  if (blueprints.length > 0 && packs.length === 0) findings.push({ severity: "warning", category: "assets", message: "Blueprints exist without an asset pack reference." });
  if (blueprints.length > 0 && locations.length === 0) findings.push({ severity: "warning", category: "map-links", message: "Blueprint exits have no canonical location records to anchor their links." });
  if (records.some(record => record.kind === "lore") && !records.some(record => record.kind === "progression")) findings.push({ severity: "info", category: "progression", message: "Lore exists without a progression gate; review act visibility before export." });
  if (packs.some(pack => pack.tileSize !== 16)) findings.push({ severity: "warning", category: "assets", message: "A pack is not aligned to the canonical 16×16 grid." });
  return findings;
}
