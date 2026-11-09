import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { transientBackendReadQueryPolicy } from "@clc/api/client/errors";
import { accountActivityLatestQueryOptions } from "@clc/api/features/accounts/queries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import {
  advanceSeenMarker,
  countUnseenIncoming,
  isIncomingActivity,
  isUnseen,
  type SeenMarker,
} from "#/features/wallet/logic/activity-unseen";
import {
  readSeenMarker,
  useSeenMarker,
  writeSeenMarker,
} from "#/features/wallet/state/activity-seen";
import { accountsClient } from "#/lib/api/accounts";
import type { StorageOwner } from "#/lib/storage/owner-tier-key";

/** The rows the count looks at: one page, so the badge tops out at this many. */
const LATEST_PAGE_SIZE = 20;
const LATEST_POLL_MS = 30_000;

/** Dispatched by the realtime session when a push lands in the inbox. */
const INBOX_CHANGED_EVENT = "clc-notification-inbox-changed";

/**
 * How many incoming Activity rows arrived since the person last opened
 * Activity, read from the newest page and a marker in `localStorage`.
 *
 * Guests and an undecided session count nothing. The first successful read for
 * an owner with no marker seeds one silently, so a new device does not open on
 * a full badge.
 */
export function useActivityUnseen() {
  const auth = useAuthStatus();
  const owner = useStorageOwner();
  const address = auth.isAuthenticated ? auth.address : undefined;
  const enabled = Boolean(address) && owner !== null;
  const queryClient = useQueryClient();
  const latest = useQuery({
    ...accountActivityLatestQueryOptions(accountsClient, address, LATEST_PAGE_SIZE),
    ...transientBackendReadQueryPolicy,
    staleTime: 4_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: LATEST_POLL_MS,
    refetchIntervalInBackground: false,
    enabled,
  });
  const marker = useSeenMarker(owner);
  const items = latest.data?.activity;

  useEffect(() => {
    // Read storage itself, not `marker`: the first render after hydration still
    // carries the server snapshot, which is always empty.
    if (!owner || !items || readSeenMarker(owner)) return;
    writeSeenMarker(owner, advanceSeenMarker(items, null));
  }, [owner, items]);

  useEffect(() => {
    if (!enabled) return;
    const { queryKey } = accountActivityLatestQueryOptions(
      accountsClient,
      address,
      LATEST_PAGE_SIZE,
    );
    const refresh = () => void queryClient.invalidateQueries({ queryKey });
    window.addEventListener(INBOX_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(INBOX_CHANGED_EVENT, refresh);
  }, [address, enabled, queryClient]);

  /** Marks the newest page as seen, plus any rows the caller has on screen. */
  const markSeen = useCallback(
    (shown: readonly AccountActivityItem[] = []) => {
      if (!owner || !items) return;
      const current = readSeenMarker(owner);
      const next = advanceSeenMarker([...items, ...shown], current);
      if (next !== current) writeSeenMarker(owner, next);
    },
    [owner, items],
  );

  const count =
    enabled && address && marker && items ? countUnseenIncoming(items, marker, address) : 0;
  return { count, owner, address, items, markSeen };
}

/**
 * The Activity screen's side of the count: opening it clears the badge, and
 * the rows that were unread stay marked for the rest of the visit.
 *
 * `shown` is the screen's unfiltered list, or nothing while a search or filter
 * narrows it. The screen polls faster than the badge, so a row can appear there
 * before the newest page has it; marking only the newest page would leave that
 * row to come back as unread after the person has seen it.
 */
export function useActivityVisit(shown?: readonly AccountActivityItem[]) {
  const { owner, address, items, markSeen } = useActivityUnseen();
  const [before, setBefore] = useState<{ owner: StorageOwner; marker: SeenMarker | null } | null>(
    null,
  );

  useEffect(() => {
    if (!owner || !items) return;
    if (before?.owner !== owner) setBefore({ owner, marker: readSeenMarker(owner) });
    markSeen(shown);
  }, [before?.owner, items, markSeen, owner, shown]);

  const baseline = before && before.owner === owner ? before.marker : null;
  return useCallback(
    (item: AccountActivityItem) =>
      baseline !== null &&
      address !== undefined &&
      isIncomingActivity(item, address) &&
      isUnseen(item, baseline),
    [address, baseline],
  );
}
