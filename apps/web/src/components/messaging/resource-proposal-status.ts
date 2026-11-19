export type PoolProposalApprovalState = "approved" | "available" | "checking" | "unavailable";

export function resolvePoolProposalApprovalState(input: {
  poolPending: boolean;
  poolLoaded: boolean;
  poolError: boolean;
  hasRegistry: boolean;
  membership?: boolean;
  membershipPending: boolean;
  membershipError: boolean;
  legacyPending: boolean;
  legacyError: boolean;
  legacyApproved: boolean;
}): PoolProposalApprovalState {
  if (input.poolPending) return "checking";
  if (!input.poolLoaded) return input.poolError ? "unavailable" : "checking";
  if (input.hasRegistry) {
    if (input.membership === true) return "approved";
    if (input.membershipPending) return "checking";
    return input.membershipError ? "unavailable" : "available";
  }
  if (input.legacyApproved) return "approved";
  if (input.legacyPending) return "checking";
  return input.legacyError ? "unavailable" : "available";
}
