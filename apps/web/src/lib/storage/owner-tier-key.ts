/**
 * The key shape for owner-tiered `localStorage`.
 *
 * Its own module because both {@link ./owner-scoped-storage} (which composes
 * keys) and {@link ./owner-tier-registry} (which enumerates and parses them)
 * need it, and having either import the other would make a cycle.
 */

/** A lowercased wallet address, or `"guest"`. */
export type StorageOwner = string;

/**
 * The tier used when nobody is signed in. Public screens read and write here.
 *
 * Lives in the storage layer rather than beside any one store because being a
 * guest is an identity fact, not a location or a filter fact — two modules
 * spelling it separately is how they drift apart.
 */
export const GUEST_STORAGE_OWNER = "guest";

/**
 * `clc.t.<owner>.<name>` — owner **before** name.
 *
 * That order is what lets eviction find everything belonging to one person with
 * a single prefix scan and no registry of tiered names anywhere. The reverse
 * would force `lib/storage/` to hold a list of the key prefixes owned by
 * `features/wallet/` and `lib/navigation/`, inverting the dependency for no
 * gain. A lowercased address and `"guest"` contain no `.`, so the owner segment
 * parses back out unambiguously even though `name` does contain dots.
 */
export const OWNER_TIER_KEY_PREFIX = "clc.t.";

export function ownerScopedKey(owner: StorageOwner, name: string): string {
  return `${OWNER_TIER_KEY_PREFIX}${owner}.${name}`;
}

/** The owner segment of a tiered key, or null when the key is not a tiered one. */
export function ownerOfTieredKey(key: string): StorageOwner | null {
  if (!key.startsWith(OWNER_TIER_KEY_PREFIX)) return null;
  const rest = key.slice(OWNER_TIER_KEY_PREFIX.length);
  const boundary = rest.indexOf(".");
  if (boundary <= 0) return null;
  return rest.slice(0, boundary);
}

export function ownerTierKeyPrefixFor(owner: StorageOwner): string {
  return `${OWNER_TIER_KEY_PREFIX}${owner}.`;
}
