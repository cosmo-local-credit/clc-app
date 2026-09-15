import {
  getLocalStorage,
  readStorageItem,
  removeStorageItem,
  writeStorageItem,
} from "#/lib/storage/local-storage";
import {
  OWNER_TIER_KEY_PREFIX,
  ownerOfTieredKey,
  ownerTierKeyPrefixFor,
  type StorageOwner,
} from "#/lib/storage/owner-tier-key";

/**
 * The bound on {@link ./owner-scoped-storage}'s retained owner tiers.
 *
 * Keeping every owner's tier is what lets a returning user find their data, but
 * it is unbounded by construction — one tier per person who has ever signed in
 * on the device. `localStorage` is a ~5MB origin budget, and when it runs out
 * the failure is not that old data falls off: `setItem` throws, so *writes stop
 * working for whoever is holding the phone now*. A stranger's stale address book
 * would be denying the current user their own.
 *
 * Two bounds, both least-recently-used first, and both **per owner** rather than
 * per store — the unit people think in is "the last few users", and dropping one
 * person's data atomically leaves no half-forgotten account behind:
 *
 * - **A cap** ({@link MAX_RETAINED_OWNER_TIERS}), applied when an identity
 *   resolves, so the tier set cannot grow without limit in the first place.
 * - **Eviction on quota failure**, so a device that fills anyway — sharing the
 *   origin budget with something else — recovers instead of dropping the write.
 *
 * This module is deliberately separable. Deleting it, the `touchOwnerTier` call
 * in `use-identity-transition.ts` and the quota branch in `writeOwnerScoped`
 * restores uncapped retention and changes nothing else.
 */

/**
 * How many owners keep a tier.
 *
 * Generous for the case this exists for — a phone shared by a handful of people,
 * where nobody should ever reach it. It is a guard against unbounded growth, not
 * a retention policy. A device serving more than this forgets the least recently
 * active person's saved recipients and remembered filters first, which is the
 * person most likely to have moved on. Not their money, not their key, not
 * anything the backend holds.
 */
export const MAX_RETAINED_OWNER_TIERS = 8;

const REGISTRY_KEY = "clc.owner-tiers.v1";

/**
 * The unscoped keys this scheme replaced.
 *
 * Dropped rather than migrated. None of them records an owner, so migrating is a
 * guess about whose data it is — and on a device that has already been shared,
 * the blob is a merge of several people. A wrong guess hands one villager's list
 * of payees to another, which is the leak this work exists to close.
 *
 * `clc_last_location_v2` and `clc_post_draft_v1` are deliberately absent: they
 * keep their single-slot-plus-owner-field shape, so their keys are still live.
 */
const LEGACY_UNSCOPED_KEYS = [
  "clc_address_book_v1",
  "clc.market.filter-preferences.v1",
  "clc.pools.filter-preferences.v1",
  "clc.posts.filter-preferences.v1",
] as const;

/** Records `owner` as most recently used and drops any tier past the cap. */
export function touchOwnerTier(owner: StorageOwner): void {
  const owners = [owner, ...readRegistry().filter((candidate) => candidate !== owner)];

  for (const dropped of owners.slice(MAX_RETAINED_OWNER_TIERS)) {
    removeOwnerTier(dropped);
  }

  writeRegistry(owners.slice(0, MAX_RETAINED_OWNER_TIERS));
}

/**
 * Drops the least recently used owner's tier so a quota-failed write can retry.
 *
 * Returns whether anything was actually freed, so a caller that retries on true
 * and gives up on false cannot loop. `exempt` is the owner being written, who
 * must never be chosen as their own victim.
 *
 * Falls back to a prefix scan when the registry is missing — it can be, having
 * been cleared by hand or lost to the very quota failure being recovered from —
 * so a device without bookkeeping still has a working valve.
 */
export function evictLeastRecentlyUsedOwnerTier(exempt: StorageOwner): boolean {
  const registered = readRegistry().filter((owner) => owner !== exempt);
  const victim = registered.at(-1);
  if (victim) {
    removeOwnerTier(victim);
    writeRegistry(readRegistry().filter((owner) => owner !== victim));
    return true;
  }

  const scanned = scanForAnyOwnerExcept(exempt);
  if (!scanned) return false;

  // No registry write on this path, and not merely because there is no entry to
  // remove: this runs to recover from a full store, and persisting the registry
  // would spend the room just freed — leaving the retry to fail for exactly the
  // reason the eviction was meant to fix.
  removeOwnerTier(scanned);
  return true;
}

/**
 * Removes the pre-tier keys, once per app load.
 *
 * Idempotent and cheap enough to call on every resolved identity: after the
 * first pass the keys are gone and each `removeItem` is a no-op, so it needs no
 * "already done" marker of its own.
 */
export function dropLegacyUnscopedKeys(): void {
  for (const key of LEGACY_UNSCOPED_KEYS) {
    removeStorageItem(key);
  }
}

function removeOwnerTier(owner: StorageOwner): void {
  const storage = getLocalStorage();
  if (!storage) return;

  const prefix = ownerTierKeyPrefixFor(owner);
  const doomed: string[] = [];
  try {
    // Collected before removing: mutating the store mid-enumeration shifts the
    // indices underneath us and would skip keys.
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) doomed.push(key);
    }
  } catch {
    return;
  }

  for (const key of doomed) {
    removeStorageItem(key);
  }
}

function scanForAnyOwnerExcept(exempt: StorageOwner): StorageOwner | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(OWNER_TIER_KEY_PREFIX)) continue;
      const owner = ownerOfTieredKey(key);
      if (owner && owner !== exempt) return owner;
    }
  } catch {
    return null;
  }
  return null;
}

/** Most recently used first. */
function readRegistry(): StorageOwner[] {
  const raw = readStorageItem(REGISTRY_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
    const owners = (parsed as { owners?: unknown }).owners;
    if (!Array.isArray(owners)) return [];
    return owners.filter((owner): owner is string => typeof owner === "string" && owner.length > 0);
  } catch {
    return [];
  }
}

function writeRegistry(owners: StorageOwner[]): void {
  // Bookkeeping, not data: losing it costs LRU precision on the next eviction,
  // which the prefix-scan fallback absorbs. Failing the write it describes would
  // cost the user their input, so this never propagates.
  writeStorageItem(REGISTRY_KEY, JSON.stringify({ owners }));
}
