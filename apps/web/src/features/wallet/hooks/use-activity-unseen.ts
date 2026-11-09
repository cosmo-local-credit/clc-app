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

/** Page size for the unread window, which is read back through the seen block. */
const LATEST_PAGE_SIZE = 20;
const LATEST_POLL_MS = 30_000;

/** Dispatched by the realtime session when a push lands in the inbox. */
const INBOX_CHANGED_EVENT = "clc-notification-inbox-changed";

/**
 * How many incoming Activity rows arrived since the person last opened
 * Activity, read back through the marker saved in `localStorage`.
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
  const marker = useSeenMarker(owner);
  const since = marker?.at;
  const queryClient = useQueryClient();
  const latest = useQuery({
    ...accountActivityLatestQueryOptions(accountsClient, address, LATEST_PAGE_SIZE, since),
    ...transientBackendReadQueryPolicy,
    staleTime: 4_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchInterval: LATEST_POLL_MS,
    refetchIntervalInBackground: false,
    enabled,
  });
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
      since,
    );
    const refresh = () => void queryClient.invalidateQueries({ queryKey });
    window.addEventListener(INBOX_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(INBOX_CHANGED_EVENT, refresh);
  }, [address, enabled, queryClient, since]);

  const count =
    enabled && address && marker && items ? countUnseenIncoming(items, marker, address) : 0;
  return { count };
}

/**
 * Successfully displayed, unfiltered Activity advances the seen marker while
 * the document is visible. Unread rows keep their dots for the whole visit.
 *
 * `shown` is absent while the feed is pending, failed or filtered. The badge's
 * independent request never acknowledges rows on behalf of this screen.
 */
export function useActivityVisit(shown?: readonly AccountActivityItem[]) {
  const auth = useAuthStatus();
  const owner = useStorageOwner();
  const address = auth.isAuthenticated ? auth.address : undefined;
  const [before, setBefore] = useState<{ owner: StorageOwner; marker: SeenMarker | null } | null>(
    null,
  );

  useEffect(() => {
    if (!owner || !address) return;
    const acknowledge = () => {
      if (document.visibilityState !== "visible") return;
      const marker = readSeenMarker(owner);
      setBefore((current) => (current?.owner === owner ? current : { owner, marker }));
      if (!shown) return;
      const next = advanceSeenMarker(shown, marker);
      if (next !== marker) writeSeenMarker(owner, next);
    };
    acknowledge();
    document.addEventListener("visibilitychange", acknowledge);
    return () => document.removeEventListener("visibilitychange", acknowledge);
  }, [address, owner, shown]);

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
