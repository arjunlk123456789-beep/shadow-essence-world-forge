import { describe, expect, it } from "vitest";
import { canApplyProposal, statusAfterGeminiTest, statusAfterKeySave } from "./workflow";

describe("World Forge workflow guards", () => {
  it("allows only pending proposals to enter the canonical apply path", () => {
    expect(canApplyProposal("pending")).toBe(true);
    expect(canApplyProposal("applied")).toBe(false);
    expect(canApplyProposal("rejected")).toBe(false);
  });

  it("moves Gemini settings through safe status transitions", () => {
    expect(statusAfterKeySave()).toBe("untested");
    expect(statusAfterGeminiTest(true)).toBe("valid");
    expect(statusAfterGeminiTest(false)).toBe("invalid");
  });
});
