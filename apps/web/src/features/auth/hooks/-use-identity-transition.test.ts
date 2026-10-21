import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  owner: null as string | null,
  queryClient: {},
  clearQueries: vi.fn(),
  clearDrafts: vi.fn(),
  resetNotifications: vi.fn(),
  dropLegacy: vi.fn(),
  touchTier: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mocks.queryClient }));
vi.mock("#/features/auth/api/identity-reset", () => ({
  clearInMemoryDrafts: mocks.clearDrafts,
  clearScopedQueries: mocks.clearQueries,
}));
vi.mock("#/features/auth/hooks/use-storage-owner", () => ({
  useStorageOwner: () => mocks.owner,
}));
vi.mock("#/features/notifications/recovery/identity-reset", () => ({
  resetNotificationIdentity: mocks.resetNotifications,
}));
vi.mock("#/lib/storage/owner-tier-registry", () => ({
  dropLegacyUnscopedKeys: mocks.dropLegacy,
  touchOwnerTier: mocks.touchTier,
}));

import {
  noteResolvedIdentity,
  resetIdentityTransitionForTests,
  useIdentityTransitionTeardown,
} from "#/features/auth/hooks/use-identity-transition";

const ALICE = "0xa316408425cf17f1827483dee621c6c3a9b5fad4";
const BOB = "0xb316408425cf17f1827483dee621c6c3a9b5fad4";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner = null;
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

describe("useIdentityTransitionTeardown", () => {
  it("does nothing while the storage owner is undetermined", () => {
    renderHook(() => useIdentityTransitionTeardown());

    expect(mocks.dropLegacy).not.toHaveBeenCalled();
    expect(mocks.resetNotifications).not.toHaveBeenCalled();
  });

  it("cleans persisted guest notification residue on the initial guest resolution", () => {
    mocks.owner = "guest";

    renderHook(() => useIdentityTransitionTeardown());

    expect(mocks.dropLegacy).toHaveBeenCalledOnce();
    expect(mocks.touchTier).toHaveBeenCalledWith("guest");
    expect(mocks.resetNotifications).toHaveBeenCalledWith({ onlyIfSessionEnded: true });
    expect(mocks.clearQueries).not.toHaveBeenCalled();
  });

  it("clears scoped state and the outgoing notification identity on account replacement", () => {
    mocks.owner = ALICE;
    const view = renderHook(() => useIdentityTransitionTeardown());
    mocks.owner = BOB;

    view.rerender();

    expect(mocks.clearQueries).toHaveBeenCalledWith(mocks.queryClient);
    expect(mocks.clearDrafts).toHaveBeenCalledOnce();
    expect(mocks.resetNotifications).toHaveBeenCalledWith({ previousWalletAddress: ALICE });
  });

  it("does not unlink a notification wallet when signing in from guest", () => {
    mocks.owner = "guest";
    const view = renderHook(() => useIdentityTransitionTeardown());
    mocks.resetNotifications.mockClear();
    mocks.owner = ALICE;

    view.rerender();

    expect(mocks.clearQueries).toHaveBeenCalledWith(mocks.queryClient);
    expect(mocks.clearDrafts).toHaveBeenCalledOnce();
    expect(mocks.resetNotifications).not.toHaveBeenCalled();
  });
});
