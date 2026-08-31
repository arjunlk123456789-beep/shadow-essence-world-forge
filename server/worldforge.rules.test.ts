import { describe, expect, it } from "vitest";
import { validateWorld } from "./qa";

describe("World Forge QA rules", () => {
  it("detects missing references and lore requirements", () => {
    const findings = validateWorld([], [], [{ payload: JSON.stringify({ connections: "South", assetPackId: 99, requirements: ["Lore clue"] }) }]);
    expect(findings.map(item => item.category)).toEqual(expect.arrayContaining(["map-links", "assets", "lore"]));
  });

  it("detects progression review needs when lore has no gate", () => {
    const findings = validateWorld([{ kind: "lore" }], [{ id: 1, tileSize: 16 }], []);
    expect(findings.some(item => item.category === "progression")).toBe(true);
  });

  it("flags non-canonical tile sizes", () => {
    const findings = validateWorld([], [{ id: 1, tileSize: 32 }], []);
    expect(findings).toContainEqual(expect.objectContaining({ category: "assets", severity: "warning" }));
  });
});
