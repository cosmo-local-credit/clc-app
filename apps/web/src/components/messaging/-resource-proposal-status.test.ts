import { describe, expect, it } from "vite-plus/test";
import { resolvePoolProposalApprovalState } from "./resource-proposal-status";

const base = {
  poolPending: false,
  poolLoaded: true,
  poolError: false,
  hasRegistry: true,
  membership: false,
  membershipPending: false,
  membershipError: false,
  legacyPending: false,
  legacyError: false,
  legacyApproved: false,
};

describe("resolvePoolProposalApprovalState", () => {
  it("shows Approved for authoritative registry membership", () => {
    expect(resolvePoolProposalApprovalState({ ...base, membership: true })).toBe("approved");
  });

  it("uses the complete catalog for legacy Pools", () => {
    expect(
      resolvePoolProposalApprovalState({
        ...base,
        hasRegistry: false,
        membership: undefined,
        legacyApproved: true,
      }),
    ).toBe("approved");
  });

  it("waits for authoritative reads and otherwise permits approval", () => {
    expect(resolvePoolProposalApprovalState({ ...base, membershipPending: true })).toBe("checking");
    expect(resolvePoolProposalApprovalState(base)).toBe("available");
  });

  it("does not offer approval when the authoritative check fails", () => {
    expect(resolvePoolProposalApprovalState({ ...base, membershipError: true })).toBe(
      "unavailable",
    );
    expect(
      resolvePoolProposalApprovalState({
        ...base,
        hasRegistry: false,
        membership: undefined,
        legacyError: true,
      }),
    ).toBe("unavailable");
  });
});
