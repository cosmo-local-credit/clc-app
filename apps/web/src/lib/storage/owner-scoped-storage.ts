import {
  getLocalStorage,
  isStorageQuotaError,
  readStorageItem,
  removeStorageItem,
} from "#/lib/storage/local-storage";
import { ownerScopedKey, type StorageOwner } from "#/lib/storage/owner-tier-key";
import { evictLeastRecentlyUsedOwnerTier } from "#/lib/storage/owner-tier-registry";

/**
 * Owner-scoped `localStorage`, for app data on a device several people use.
 *
 * `apps/web` is passed around: one phone in a village serves several users, each
 * signing in with their own paper wallet. Storing app data under one key per
 * concern meant whoever signed in next read whoever signed in last — their saved
 * recipients, their remembered filters.
 *
 * The owner is therefore part of the **key**, not a field inside the value. That
 * makes isolation structural instead of remembered: a store that forgets to
 * scope itself reads a key nobody wrote and gets nothing, rather than reading
 * someone else's row and having to notice whose it is. The two older modules
 * here (`features/home/api/last-location-storage.ts`,
 * `features/posts/api/post-draft-storage.ts`) guard an `owner` field on read
 * instead, which is sound but holds only as long as every future reader
 * remembers the guard — and for a single-slot store it is the stronger shape,
 * since only one person's row can exist at a time, so they keep it.
 *
 * Every owner's tier is retained, so a returning user finds their data again.
 * {@link ./owner-tier-registry} is the bound on that.
 *
 * **Secrets do not belong here.** The paper-wallet key and the passkey
 * credential stay single-slot and are deleted outright at every identity
 * boundary (`features/auth/api/identity-reset.ts`). Tiering them would leave
 * every past user's raw private key on the device permanently — the opposite of
 * the point.
 */

export function readOwnerScoped(owner: StorageOwner, name: string): string | null {
  return readStorageItem(ownerScopedKey(owner, name));
}

/**
 * Writes one owner's copy of one store, or gives up quietly.
 *
 * The quota branch is the only place this design's cost surfaces. Retaining a
 * tier per person is unbounded, and when `localStorage` fills, the symptom is
 * not that old data falls off — it is that `setItem` throws, so a stranger's
 * stale address book starts denying the current user their own writes. So on a
 * quota failure, evict the least recently used *other* owner and try again,
 * repeating while there is still something to evict.
 *
 * Every other failure is swallowed, matching the contract in
 * {@link ./local-storage}: a blocked store must not break the screen in use.
 */
export function writeOwnerScoped(owner: StorageOwner, name: string, value: string): void {
  const storage = getLocalStorage();
  if (!storage) return;

  const key = ownerScopedKey(owner, name);
  for (;;) {
    try {
      storage.setItem(key, value);
      return;
    } catch (error) {
      if (!isStorageQuotaError(error)) return;
      if (!evictLeastRecentlyUsedOwnerTier(owner)) return;
    }
  }
}

export function removeOwnerScoped(owner: StorageOwner, name: string): void {
  removeStorageItem(ownerScopedKey(owner, name));
}
