import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  noteResolvedIdentity,
  resetIdentityTransitionForTests,
} from "#/features/auth/hooks/use-identity-transition";

const ALICE = "0xa316408425cf17f1827483dee621c6c3a9b5fad4";
const BOB = "0xb316408425cf17f1827483dee621c6c3a9b5fad4";

beforeEach(() => {
  resetIdentityTransitionForTests();
});

describe("noteResolvedIdentity", () => {
  it("is not a transition the first time an identity resolves", () => {
    // Nothing preceded it, so there is no previous owner's residue to clear.
    expect(noteResolvedIdentity(ALICE)).toBeNull();
  });

  it("does not re-fire for the same owner, including across a remount", () => {
    noteResolvedIdentity(ALICE);
    expect(noteResolvedIdentity(ALICE)).toBeNull();
    expect(noteResolvedIdentity(ALICE)).toBeNull();
  });

  it("reports a sign-out", () => {
    noteResolvedIdentity(ALICE);
    expect(noteResolvedIdentity("guest")).toEqual({ from: ALICE, to: "guest" });
  });

  it("reports a sign-in", () => {
    noteResolvedIdentity("guest");
    expect(noteResolvedIdentity(ALICE)).toEqual({ from: "guest", to: ALICE });
  });

  it("reports one account replacing another", () => {
    noteResolvedIdentity(ALICE);
    expect(noteResolvedIdentity(BOB)).toEqual({ from: ALICE, to: BOB });
  });

  // The hook returns early on a null owner rather than calling this, so a
  // session check that flaps produces `A -> A` here, not `A -> guest -> A`.
  // Without that, every network blip would fire a teardown and wipe the cache.
  it("sees no transition when an undetermined owner is skipped", () => {
    noteResolvedIdentity(ALICE);
    expect(noteResolvedIdentity(ALICE)).toBeNull();
  });

  it("fires once when a wallet switch settles, not per intermediate render", () => {
    noteResolvedIdentity(ALICE);
    // The session query re-keys mid-switch, so the owner is null and the hook
    // skips; only the settled identity is noted.
    expect(noteResolvedIdentity(BOB)).toEqual({ from: ALICE, to: BOB });
    expect(noteResolvedIdentity(BOB)).toBeNull();
  });
});
