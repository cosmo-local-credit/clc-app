import { describe, expect, it, vi } from "vite-plus/test";

import type { AuthClient } from "./client";
import { authKeys, profileQueryOptions } from "./queries";

const ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";

describe("authKeys.profile", () => {
  it("hangs off `all`, so a prefix sweep reaches it", () => {
    // The admin console clears everything under ["clc", …] on sign-out and session
    // expiry. A profile keyed outside that prefix would survive an identity change.
    const key = authKeys.profile(ADDRESS);
    expect(key.slice(0, authKeys.all.length)).toEqual([...authKeys.all]);
    expect(key[0]).toBe("clc");
  });

  it("separates one account's profile from another's", () => {
    // apps/web can switch wallets without a reload, so these must not collide.
    expect(authKeys.profile(ADDRESS)).not.toEqual(authKeys.profile("0xdead"));
  });

  it("normalizes address casing", () => {
    expect(authKeys.profile(ADDRESS)).toEqual(authKeys.profile(ADDRESS.toLowerCase()));
  });

  it("gives the address-less read its own slot rather than colliding with an account", () => {
    // apps/admin passes no address. That must not alias to any wallet's profile.
    const current = authKeys.profile();
    expect(current).toEqual(["clc", "auth", "profile", "current"]);
    expect(current).not.toEqual(authKeys.profile(ADDRESS));
  });
});

describe("profileQueryOptions", () => {
  it("reads the profile through the injected client", async () => {
    const getProfile = vi.fn(() => Promise.resolve({ name: "Ada" }));
    const options = profileQueryOptions({ getProfile } as unknown as AuthClient, ADDRESS);

    await expect(options.queryFn?.({} as never)).resolves.toEqual({ name: "Ada" });
    expect(getProfile).toHaveBeenCalledTimes(1);
  });

  it("leaves `enabled` and `retry` to the caller", () => {
    // apps/web must not fetch before a wallet connects, and must not retry the 404
    // that means "no profile yet". Baking either in here would take that choice away.
    const options = profileQueryOptions({} as AuthClient, ADDRESS) as Record<string, unknown>;
    expect(options.enabled).toBeUndefined();
    expect(options.retry).toBeUndefined();
  });
});
