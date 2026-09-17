/**
 * The one `localStorage` accessor for `apps/web`.
 *
 * Four modules had grown an identical private `getStorage()` — last-location,
 * post-draft, catalog-filter-preference and address-book — each wrapping access
 * in the same try/catch for the same reason: `window.localStorage` throws rather
 * than returning null when site data is blocked, and it is absent entirely
 * during SSR. A screen must survive both.
 *
 * The contract every caller depends on: **a storage failure is never an
 * exception.** Reads answer null, writes report false. A full or blocked store
 * must not break the editor being typed into or the map being panned.
 */

export function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStorageItem(key: string): string | null {
  try {
    return getLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** @returns false when the store refused the write — absent, blocked, or full. */
export function writeStorageItem(key: string, value: string): boolean {
  try {
    const storage = getLocalStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorageItem(key: string): void {
  try {
    getLocalStorage()?.removeItem(key);
  } catch {
    // Unreachable store; the caller is already on a teardown path.
  }
}

/**
 * Whether a write failed for want of room, as opposed to being blocked outright.
 *
 * The distinction decides whether evicting something and retrying can help. No
 * two engines agree on how to signal it: the standard is a `DOMException` named
 * `QuotaExceededError`, Firefox has historically used
 * `NS_ERROR_DOM_QUOTA_REACHED`, and older WebKit used code 22 with no usable
 * name. All three are treated as the same condition.
 */
export function isStorageQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22
  );
}
