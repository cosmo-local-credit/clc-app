import { useQuery } from "@tanstack/react-query";
import {
  getTrackingOutcome,
  isTrackingNotFound,
  TRACKING_POLL_MS,
  type OtxTrackingOutcome,
} from "@clc/api/features/auth/client";
import { authClient } from "#/lib/api/auth";

/**
 * A trackingId is issued as soon as a job is enqueued, before the async relayer
 * worker has written the corresponding OTX row. Polling in that window gets a
 * 404 that's "not written yet", not a tracking failure, so treat it the same as
 * a pending outcome. The predicate lives in @clc/api because the poller behind
 * the one-shot waits needs the same rule.
 */
export function useOtxTracking(
  trackingId: string | null,
  options: {
    enabled?: boolean;
    pollMs?: number;
    queryKey?: string;
    queryFn?: (trackingId: string) => Promise<Awaited<ReturnType<typeof authClient.trackOtx>>>;
    getOutcome?: typeof getTrackingOutcome;
  } = {},
) {
  const enabled = options.enabled ?? true;
  const pollMs = options.pollMs ?? TRACKING_POLL_MS;
  const queryKey = options.queryKey ?? "otx-track";
  const queryFn = options.queryFn ?? ((trackingId: string) => authClient.trackOtx(trackingId));
  const getOutcome = options.getOutcome ?? getTrackingOutcome;

  const query = useQuery({
    queryKey: [queryKey, trackingId],
    queryFn: () => queryFn(trackingId!),
    enabled: Boolean(trackingId) && enabled,
    retry: false,
    refetchIntervalInBackground: true,
    refetchInterval: (currentQuery) => {
      if (!trackingId || !enabled) return false;
      if (isTrackingNotFound(currentQuery.state.error)) return pollMs;
      const outcome = getOutcome(currentQuery.state.data);
      return outcome.kind === "pending" ? pollMs : false;
    },
  });

  const outcome: OtxTrackingOutcome = query.isError
    ? isTrackingNotFound(query.error)
      ? { kind: "pending" }
      : {
          kind: "error",
          error: query.error instanceof Error ? query.error.message : "Tracking failed.",
        }
    : getOutcome(query.data);

  return {
    ...query,
    outcome,
  };
}
