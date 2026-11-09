import { useMemo, useSyncExternalStore } from "react";

import { parseSeenMarker, type SeenMarker } from "#/features/wallet/logic/activity-unseen";
import { readOwnerScoped, writeOwnerScoped } from "#/lib/storage/owner-scoped-storage";
import { OWNER_TIER_KEY_PREFIX, type StorageOwner } from "#/lib/storage/owner-tier-key";

/**
 * The person's Activity high-water mark, one per storage owner, so each person
 * who signs in on a shared phone keeps their own unread count.
 */
const SEEN_MARKER_NAME = "activity.seen.v1";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of the app that opened Activity clears this one's count too.
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      (event.key.startsWith(OWNER_TIER_KEY_PREFIX) && event.key.endsWith(`.${SEEN_MARKER_NAME}`))
    ) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readSeenMarker(owner: StorageOwner): SeenMarker | null {
  return parseSeenMarker(readOwnerScoped(owner, SEEN_MARKER_NAME));
}

export function writeSeenMarker(owner: StorageOwner, marker: SeenMarker) {
  writeOwnerScoped(owner, SEEN_MARKER_NAME, JSON.stringify(marker));
  for (const listener of listeners) listener();
}

export function useSeenMarker(owner: StorageOwner | null): SeenMarker | null {
  // The snapshot is the stored string, not the parsed marker: a fresh object on
  // every read would never compare equal, and React would re-render forever.
  const raw = useSyncExternalStore(
    subscribe,
    () => (owner ? readOwnerScoped(owner, SEEN_MARKER_NAME) : null),
    () => null,
  );
  return useMemo(() => parseSeenMarker(raw), [raw]);
}
