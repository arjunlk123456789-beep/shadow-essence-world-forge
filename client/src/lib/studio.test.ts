import { describe, expect, it } from "vitest";
import { applyStudioTool, buildStudioScope, canEditStudioLayer, clampStudioZoom, createStudioMap, pushStudioHistory, resolveStudioPointerIndex, runStudioDraftChecks, studioArchitectLayer, studioModes, studioProposalTransition, STUDIO_COLUMNS, STUDIO_ROWS, studioCellCoordinate } from "./studio";

describe("World Studio helpers", () => {
  it("creates a predictable 16×16-aligned working grid", () => {
    const map = createStudioMap();
    expect(map).toHaveLength(STUDIO_COLUMNS * STUDIO_ROWS);
    expect(map[0]).toMatchObject({ terrain: "water" });
    expect(map[24 * 7 + 12]).toMatchObject({ terrain: "grass" });
  });

  it("applies paint, water, road, build, and erase tools immutably", () => {
    const source = createStudioMap();
    expect(applyStudioTool(source, 50, "select")).toBe(source);
    expect(applyStudioTool(source, 50, "road")[50]?.terrain).toBe("road");
    expect(applyStudioTool(source, 50, "river")[50]?.terrain).toBe("water");
    expect(applyStudioTool(source, 50, "build")[50]?.object).toBe("shrine");
    expect(applyStudioTool(source, 50, "erase")[50]?.terrain).toBe("grass");
    expect(source[50]?.object).toBeUndefined();
  });

  it("clamps zoom and returns map-cell coordinates", () => {
    expect(clampStudioZoom(4)).toBe(1.55);
    expect(clampStudioZoom(0)).toBe(0.65);
    expect(studioCellCoordinate(24 * 7 + 12)).toEqual({ x: 12, y: 7 });
  });

  it("enforces layer locks and maps editor modes to scoped AI layers", () => {
    expect(canEditStudioLayer("Terrain", { Terrain: true })).toBe(false);
    expect(canEditStudioLayer("Roads", { Terrain: true })).toBe(true);
    expect(studioArchitectLayer("Paint")).toBe("terrain");
    expect(studioArchitectLayer("Build")).toBe("assets");
    expect(studioArchitectLayer("Logic")).toBe("lore");
  });

  it("keeps history bounded and newest-first for timeline displays", () => {
    expect(pushStudioHistory(["A", "B"], "C", 2)).toEqual(["C", "A"]);
  });

  it("exposes all five modes and maps scoped AI plans to the active mode", () => {
    expect(studioModes).toEqual(["World", "Paint", "Build", "Scene", "Logic"]);
    expect(buildStudioScope("Build").bounds).toEqual({ x: 0, y: 0, width: 24, height: 16 });
    expect(buildStudioScope("Logic").layer).toBe("lore");
  });

  it("returns visible play-test findings for incomplete draft content", () => {
    const issues = runStudioDraftChecks(createStudioMap());
    expect(issues).toHaveLength(2);
    expect(issues.join(" ")).toContain("NPC");
    expect(issues.join(" ")).toContain("encounter");
  });

  it("changes the target cell for an unsnapped pointer near a cell edge", () => {
    expect(resolveStudioPointerIndex(12, 14, 14, 28, true)).toBe(12);
    expect(resolveStudioPointerIndex(12, 26, 14, 28, false)).toBe(13);
  });

  it("keeps proposal transitions pending-only and irreversible after apply or reject", () => {
    expect(studioProposalTransition("pending", "apply")).toBe("applied");
    expect(studioProposalTransition("pending", "reject")).toBe("rejected");
    expect(studioProposalTransition("applied", "reject")).toBe("applied");
    expect(studioProposalTransition("rejected", "apply")).toBe("rejected");
  });
});
