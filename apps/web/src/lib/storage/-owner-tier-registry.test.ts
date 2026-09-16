import { beforeEach, describe, expect, it } from "vite-plus/test";

import { writeOwnerScoped } from "#/lib/storage/owner-scoped-storage";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";
import {
  dropLegacyUnscopedKeys,
  evictLeastRecentlyUsedOwnerTier,
  MAX_RETAINED_OWNER_TIERS,
  touchOwnerTier,
} from "#/lib/storage/owner-tier-registry";

const NAME = "address-book.v1";

function owner(index: number): string {
  return `0x${index.toString().padStart(40, "0")}`;
}

function seed(index: number): void {
  writeOwnerScoped(owner(index), NAME, `data-${index}`);
  touchOwnerTier(owner(index));
}

beforeEach(() => {
  localStorage.clear();
});

describe("owner tier registry", () => {
  it("keeps every owner up to the cap", () => {
    for (let index = 0; index < MAX_RETAINED_OWNER_TIERS; index += 1) seed(index);

    for (let index = 0; index < MAX_RETAINED_OWNER_TIERS; index += 1) {
      expect(localStorage.getItem(ownerScopedKey(owner(index), NAME))).toBe(`data-${index}`);
    }
  });

  it("drops the least recently used owner once past the cap", () => {
    for (let index = 0; index < MAX_RETAINED_OWNER_TIERS; index += 1) seed(index);
    // Owner 0 is now the oldest. Touching it makes owner 1 the oldest instead,
    // which is what distinguishes least-recently-*used* from insertion order.
    touchOwnerTier(owner(0));

    seed(MAX_RETAINED_OWNER_TIERS);

    expect(localStorage.getItem(ownerScopedKey(owner(1), NAME))).toBeNull();
    expect(localStorage.getItem(ownerScopedKey(owner(0), NAME))).toBe("data-0");
    expect(localStorage.getItem(ownerScopedKey(owner(MAX_RETAINED_OWNER_TIERS), NAME))).toBe(
      `data-${MAX_RETAINED_OWNER_TIERS}`,
    );
  });

  it("removes every key belonging to a dropped owner, not just one store", () => {
    for (let index = 0; index < MAX_RETAINED_OWNER_TIERS; index += 1) seed(index);
    writeOwnerScoped(owner(0), "market.filter-preferences.v1", "filters");
    writeOwnerScoped(owner(0), "posts.filter-preferences.v1", "more-filters");

    seed(MAX_RETAINED_OWNER_TIERS);

    expect(localStorage.getItem(ownerScopedKey(owner(0), NAME))).toBeNull();
    expect(
      localStorage.getItem(ownerScopedKey(owner(0), "market.filter-preferences.v1")),
    ).toBeNull();
    expect(
      localStorage.getItem(ownerScopedKey(owner(0), "posts.filter-preferences.v1")),
    ).toBeNull();
  });

  it("never evicts the owner being written for", () => {
    seed(0);
    seed(1);

    expect(evictLeastRecentlyUsedOwnerTier(owner(0))).toBe(true);
    expect(localStorage.getItem(ownerScopedKey(owner(1), NAME))).toBeNull();
    expect(localStorage.getItem(ownerScopedKey(owner(0), NAME))).toBe("data-0");

    // Only the exempt owner is left, so there is nothing further to give up.
    expect(evictLeastRecentlyUsedOwnerTier(owner(0))).toBe(false);
  });

  it("still evicts when the registry itself has been lost", () => {
    seed(0);
    seed(1);
    // The registry can be cleared by hand, or lost to the very quota failure
    // being recovered from. The prefix scan is the fallback.
    localStorage.removeItem("clc.owner-tiers.v1");

    expect(evictLeastRecentlyUsedOwnerTier(owner(1))).toBe(true);
    expect(localStorage.getItem(ownerScopedKey(owner(0), NAME))).toBeNull();
    expect(localStorage.getItem(ownerScopedKey(owner(1), NAME))).toBe("data-1");
  });

  it("returns false rather than looping when only the exempt owner has a tier", () => {
    seed(0);
    localStorage.removeItem("clc.owner-tiers.v1");

    expect(evictLeastRecentlyUsedOwnerTier(owner(0))).toBe(false);
  });
});

describe("legacy key drop", () => {
  it("removes the pre-tier keys and nothing else", () => {
    localStorage.setItem("clc_address_book_v1", "[]");
    localStorage.setItem("clc.market.filter-preferences.v1", "{}");
    localStorage.setItem("clc.pools.filter-preferences.v1", "{}");
    localStorage.setItem("clc.posts.filter-preferences.v1", "{}");
    // Still live: these two keep their single-slot-plus-owner-field shape, and
    // the credentials are not this module's business at all.
    localStorage.setItem("clc_last_location_v2", "{}");
    localStorage.setItem("clc_post_draft_v1", "{}");
    localStorage.setItem("clc_pk_raw", '"0xkey"');
    localStorage.setItem("clc_webauthn", "{}");
    localStorage.setItem("clc.theme", "dark");

    dropLegacyUnscopedKeys();

    expect(localStorage.getItem("clc_address_book_v1")).toBeNull();
    expect(localStorage.getItem("clc.market.filter-preferences.v1")).toBeNull();
    expect(localStorage.getItem("clc.pools.filter-preferences.v1")).toBeNull();
    expect(localStorage.getItem("clc.posts.filter-preferences.v1")).toBeNull();

    expect(localStorage.getItem("clc_last_location_v2")).toBe("{}");
    expect(localStorage.getItem("clc_post_draft_v1")).toBe("{}");
    expect(localStorage.getItem("clc_pk_raw")).toBe('"0xkey"');
    expect(localStorage.getItem("clc_webauthn")).toBe("{}");
    expect(localStorage.getItem("clc.theme")).toBe("dark");
  });

  it("is safe to run on every resolved identity", () => {
    dropLegacyUnscopedKeys();
    expect(() => dropLegacyUnscopedKeys()).not.toThrow();
  });
});
