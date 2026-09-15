import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  readOwnerScoped,
  removeOwnerScoped,
  writeOwnerScoped,
} from "#/lib/storage/owner-scoped-storage";
import {
  GUEST_STORAGE_OWNER,
  ownerOfTieredKey,
  ownerScopedKey,
} from "#/lib/storage/owner-tier-key";

const ALICE = "0xa316408425cf17f1827483dee621c6c3a9b5fad4";
const BOB = "0xb316408425cf17f1827483dee621c6c3a9b5fad4";
const NAME = "address-book.v1";

const realLocalStorage = localStorage;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  // Restored explicitly: `vitest.setup.ts` stubs `localStorage` with a plain
  // object for the whole run, so a stub installed here would leak into the next
  // file. Note this is also why `Storage.prototype` spies do not intercept —
  // the global is not a `Storage` instance. Stub the global instead.
  vi.stubGlobal("localStorage", realLocalStorage);
});

describe("owner-scoped storage keys", () => {
  it("puts the owner before the name so one owner's keys share a prefix", () => {
    expect(ownerScopedKey(ALICE, NAME)).toBe(`clc.t.${ALICE}.${NAME}`);
    expect(ownerScopedKey(GUEST_STORAGE_OWNER, NAME)).toBe(`clc.t.guest.${NAME}`);
  });

  it("recovers the owner even though the name contains dots", () => {
    expect(ownerOfTieredKey(ownerScopedKey(ALICE, "market.filter-preferences.v1"))).toBe(ALICE);
    expect(ownerOfTieredKey("clc_pk_raw")).toBeNull();
    expect(ownerOfTieredKey("clc.t.")).toBeNull();
  });
});

describe("owner-scoped storage", () => {
  it("round-trips a value for one owner", () => {
    writeOwnerScoped(ALICE, NAME, "saved");
    expect(readOwnerScoped(ALICE, NAME)).toBe("saved");

    removeOwnerScoped(ALICE, NAME);
    expect(readOwnerScoped(ALICE, NAME)).toBeNull();
  });

  // The leak this module exists to make structurally impossible.
  it("never shows one owner's value to another, or to a guest", () => {
    writeOwnerScoped(ALICE, NAME, "alice");
    writeOwnerScoped(BOB, NAME, "bob");

    expect(readOwnerScoped(ALICE, NAME)).toBe("alice");
    expect(readOwnerScoped(BOB, NAME)).toBe("bob");
    expect(readOwnerScoped(GUEST_STORAGE_OWNER, NAME)).toBeNull();
  });

  it("removing one owner's value leaves the other's", () => {
    writeOwnerScoped(ALICE, NAME, "alice");
    writeOwnerScoped(BOB, NAME, "bob");

    removeOwnerScoped(ALICE, NAME);

    expect(readOwnerScoped(ALICE, NAME)).toBeNull();
    expect(readOwnerScoped(BOB, NAME)).toBe("bob");
  });

  it("answers null rather than throwing when the store is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      key: () => null,
      clear: () => {},
      length: 0,
    });

    expect(readOwnerScoped(ALICE, NAME)).toBeNull();
    expect(() => writeOwnerScoped(ALICE, NAME, "x")).not.toThrow();
    expect(() => removeOwnerScoped(ALICE, NAME)).not.toThrow();
  });

  it("evicts another owner's tier and retries when the store is full", () => {
    // A budget of one entry, so the second write has to make room. This is the
    // failure the retained-tier design makes more likely: without the valve a
    // stranger's stale data denies the current user their own write.
    const entries = new Map<string, string>();
    const CAPACITY = 1;
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (!entries.has(key) && entries.size >= CAPACITY) {
          throw new DOMException("full", "QuotaExceededError");
        }
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      clear: () => entries.clear(),
      get length() {
        return entries.size;
      },
    });

    writeOwnerScoped(ALICE, NAME, "alice");
    expect(readOwnerScoped(ALICE, NAME)).toBe("alice");

    writeOwnerScoped(BOB, NAME, "bob");

    // Bob's write landed; Alice's tier was the one sacrificed for it.
    expect(readOwnerScoped(BOB, NAME)).toBe("bob");
    expect(readOwnerScoped(ALICE, NAME)).toBeNull();
  });

  it("gives up quietly when there is nothing left to evict", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => {},
      key: () => null,
      clear: () => {},
      length: 0,
    });

    // Must terminate rather than loop on an unsatisfiable write.
    expect(() => writeOwnerScoped(ALICE, NAME, "alice")).not.toThrow();
  });
});
