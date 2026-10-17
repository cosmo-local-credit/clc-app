import {
  readOwnerScoped,
  removeOwnerScoped,
  writeOwnerScoped,
} from "#/lib/storage/owner-scoped-storage";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

/**
 * The market's recent searches, newest first, kept per owner like the other
 * remembered market choices so one person's searches never surface for the
 * next on a shared phone. Read when the search screen opens and written when
 * a search runs; nothing subscribes to it.
 */
const RECENT_SEARCHES_NAME = "market.recent-searches.v1";

export const MAX_RECENT_SEARCHES = 5;

export function readRecentSearches(owner: StorageOwner): string[] {
  const raw = readOwnerScoped(owner, RECENT_SEARCHES_NAME);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
      return value.slice(0, MAX_RECENT_SEARCHES);
    }
  } catch {
    // Unreadable: dropped below.
  }
  removeOwnerScoped(owner, RECENT_SEARCHES_NAME);
  return [];
}

/** Puts `term` first, dropping an earlier spelling of it that differs only in case. */
export function rememberSearch(owner: StorageOwner, term: string): string[] {
  const key = term.toLocaleLowerCase();
  const next = [
    term,
    ...readRecentSearches(owner).filter((entry) => entry.toLocaleLowerCase() !== key),
  ].slice(0, MAX_RECENT_SEARCHES);
  writeOwnerScoped(owner, RECENT_SEARCHES_NAME, JSON.stringify(next));
  return next;
}
