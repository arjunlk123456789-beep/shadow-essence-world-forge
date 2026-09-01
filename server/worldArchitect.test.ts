import { describe, expect, it } from "vitest";
import { buildArchitectPrompt, validateWorldPlan, worldPlanSchema } from "./worldArchitect";

const scope = { layer: "terrain" as const, bounds: { x: 0, y: 0, width: 32, height: 24 } };
const validPlan = { schemaVersion: "shadow-essence.world-plan.v1" as const, intent: "Build a cursed forest", scope, operations: [{ id: "terrain-forest", kind: "add_terrain" as const, layer: "terrain" as const, target: { point: { x: 16, y: 16 } }, data: { biome: "cursed_forest" }, reason: "The command requests a cursed forest", dependencies: [] }], memoryWrites: [], qaChecks: ["Check river exits east"] };

describe("World Architect contract", () => {
  it("accepts a versioned structured world plan", () => {
    expect(worldPlanSchema.parse(validPlan).schemaVersion).toBe("shadow-essence.world-plan.v1");
    expect(validateWorldPlan(validPlan).valid).toBe(true);
  });

  it("rejects operations outside the selected layer or scope", () => {
    const outside = { ...validPlan, operations: [{ ...validPlan.operations[0], layer: "assets" as const, target: { point: { x: 48, y: 16 } } }] };
    const result = validateWorldPlan(outside);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("outside");
  });

  it("rejects non-grid-aligned terrain placement and asset operations without a reference", () => {
    const misaligned = { ...validPlan, operations: [{ ...validPlan.operations[0], data: { pixelWidth: 10, pixelHeight: 16 } }] };
    expect(validateWorldPlan(misaligned).errors.join(" ")).toContain("16×16");
    const missingAsset = { ...validPlan, scope: { ...scope, layer: "assets" as const }, operations: [{ ...validPlan.operations[0], kind: "add_asset" as const, layer: "assets" as const, target: { point: { x: 16, y: 16 } } }] };
    expect(validateWorldPlan(missingAsset).errors.join(" ")).toContain("assetId");
  });

  it("includes the command, scope, canon, and approved decisions in the architect prompt", () => {
    const prompt = buildArchitectPrompt({ command: "Add an ancient shrine", scope, canon: [{ title: "Homelands" }], previousDecisions: [{ content: "River remains east" }] });
    expect(prompt).toContain("Add an ancient shrine");
    expect(prompt).toContain("Homelands");
    expect(prompt).toContain("River remains east");
    expect(prompt).toContain("shadow-essence.world-plan.v1");
  });
});
