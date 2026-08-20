import { queryOptions } from "@tanstack/react-query";

import type { AuthClient } from "./client";
import { authKeys } from "./queries";

/**
 * Live OTX track read. A tracking id is issued as soon as the job is
 * queued, so the first polls can 404; callers treat that as pending and
 * keep refetching.
 */
export function otxTrackQueryOptions(auth: AuthClient, trackingId: string | null) {
  return queryOptions({
    queryKey: [...authKeys.all, "otx-track", trackingId ?? "none"] as const,
    queryFn: () => auth.trackOtx(trackingId!),
    enabled: Boolean(trackingId),
    retry: false,
    staleTime: 0,
  });
}
