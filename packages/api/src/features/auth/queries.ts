import { queryOptions } from "@tanstack/react-query";
import type { AuthClient } from "./client";

export const otxKeys = {
  all: ["clc", "otx"] as const,
  track: (trackingId: string) => ["clc", "otx", "track", trackingId] as const,
} as const;

/**
 * OTX tracking. Callers own the poll interval — a deploy receipt wants a couple
 * of seconds, an audit table wants none — so it is deliberately absent here
 * rather than baked in at one value.
 */
export function otxTrackQueryOptions(auth: AuthClient, trackingId: string) {
  return queryOptions({
    queryKey: otxKeys.track(trackingId),
    queryFn: () => auth.trackOtx(trackingId),
    enabled: trackingId !== "",
  });
}
