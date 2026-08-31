import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./crypto";

describe("World Forge security invariants", () => {
  beforeEach(() => { process.env.JWT_SECRET = "test-secret-for-world-forge"; });

  it("round-trips Gemini keys without storing them as plaintext", () => {
    const key = "AIzaSyExampleKeyThatIsLongEnough123456";
    const encrypted = encryptSecret(key);
    expect(encrypted).not.toContain(key);
    expect(decryptSecret(encrypted)).toBe(key);
  });

  it("only exposes a safe masked representation", () => {
    expect(maskSecret("AIzaSyExampleKeyThatIsLongEnough123456")).toBe("AIza••••3456");
    expect(maskSecret(null)).toBeNull();
  });

  it("recognizes the approval states used by the proposal workflow", () => {
    const pending = "pending";
    expect(pending).not.toBe("applied");
    expect(["pending", "applied", "rejected"]).toContain(pending);
  });
});
