import { describe, expect, it } from "vite-plus/test";

import { resolveStorageOwner } from "#/features/auth/hooks/use-storage-owner";

const ADDRESS = "0xA316408425cF17F1827483dee621c6C3A9B5fad4" as const;
const LOWERCASED = "0xa316408425cf17f1827483dee621c6c3a9b5fad4";

describe("resolveStorageOwner", () => {
  it("uses the lowercased address once the session is proven", () => {
    expect(resolveStorageOwner("authenticated", ADDRESS)).toBe(LOWERCASED);
  });

  it("treats a guest as a guest", () => {
    expect(resolveStorageOwner("guest", undefined)).toBe("guest");
  });

  // The expired-session leak: a connected wallet whose session is gone or
  // belongs to another address is a guest (docs/AUTH.md), so it must not keep
  // reading the tier it was reading a moment ago.
  it("treats a connected wallet with no matching session as a guest", () => {
    expect(resolveStorageOwner("connectedNoSession", ADDRESS)).toBe("guest");
  });

  // Undetermined is deliberately not "guest". Writing a signed-in user's data
  // into the guest tier during a blip splits it across two tiers, and the split
  // outlives the blip. Null also means `A -> null -> A` is not a transition, so
  // a flaky session check fires no teardown.
  it("is undetermined while the session is in flight or failed", () => {
    expect(resolveStorageOwner("loading", ADDRESS)).toBeNull();
    expect(resolveStorageOwner("sessionCheckError", ADDRESS)).toBeNull();
  });

  it("is undetermined when authenticated without an address", () => {
    expect(resolveStorageOwner("authenticated", undefined)).toBeNull();
  });
});
