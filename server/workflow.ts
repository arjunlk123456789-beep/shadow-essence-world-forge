export type ProposalStatus = "pending" | "applied" | "rejected";
export type GeminiStatus = "not_configured" | "untested" | "valid" | "invalid";

export function canApplyProposal(status: ProposalStatus) {
  return status === "pending";
}

export function statusAfterKeySave(): GeminiStatus { return "untested"; }
export function statusAfterGeminiTest(success: boolean): GeminiStatus { return success ? "valid" : "invalid"; }
