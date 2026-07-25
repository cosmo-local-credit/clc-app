import { useQuery } from "@tanstack/react-query";
import {
  getTrackingOutcome,
  trackOtx,
  TRACKING_POLL_MS,
  type OtxTrackingOutcome,
} from "#/features/auth/api/client";

/**
 * A trackingId is issued as soon as a job is enqueued, before the async
 * relayer worker has written the corresponding OTX row. Polling in that
 * window gets a 404 from the backend that's "not written yet", not a
 * tracking failure, so treat it the same as a pending outcome.
 */
function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  );
}

export function useOtxTracking(
  trackingId: string | null,
  options: {
    enabled?: boolean;
    pollMs?: number;
    queryKey?: string;
    queryFn?: (trackingId: string) => Promise<Awaited<ReturnType<typeof trackOtx>>>;
  } = {},
) {
  const enabled = options.enabled ?? true;
  const pollMs = options.pollMs ?? TRACKING_POLL_MS;
  const queryKey = options.queryKey ?? "otx-track";
  const queryFn = options.queryFn ?? trackOtx;

  const query = useQuery({
    queryKey: [queryKey, trackingId],
    queryFn: () => queryFn(trackingId!),
    enabled: Boolean(trackingId) && enabled,
    retry: false,
    refetchIntervalInBackground: true,
    refetchInterval: (currentQuery) => {
      if (!trackingId || !enabled) return false;
      if (isNotFoundError(currentQuery.state.error)) return pollMs;
      const outcome = getTrackingOutcome(currentQuery.state.data);
      return outcome.kind === "pending" ? pollMs : false;
    },
  });

  const outcome: OtxTrackingOutcome = query.isError
    ? isNotFoundError(query.error)
      ? { kind: "pending" }
      : {
          kind: "error",
          error: query.error instanceof Error ? query.error.message : "Tracking failed.",
        }
    : getTrackingOutcome(query.data);

  return {
    ...query,
    outcome,
  };
}
