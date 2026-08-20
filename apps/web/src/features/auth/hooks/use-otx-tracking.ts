import { BackendApiError } from "@clc/api/client/errors";
import { useQuery } from "@tanstack/react-query";
import {
  getTrackingOutcome,
  TRACKING_POLL_MS,
  type OtxTrackingOutcome,
} from "@clc/api/features/auth/client";
import { authClient } from "#/lib/api/auth";

/**
 * A trackingId is issued as soon as a job is enqueued, before the async
 * relayer worker has written the corresponding OTX row. Polling in that
 * window gets a 404 that's "not written yet", not a tracking failure, so treat
 * it the same as a pending outcome.
 *
 * This hook takes a caller-supplied `queryFn`, so the error is not always ours:
 * the calibur flows poll the relayer, which throws its own `RelayerError`. Hence
 * both arms — the taxonomy for a BackendApiError, and a 404 status for any other
 * client's error type. Narrowing this to BackendApiError alone would make a
 * relayer 404 surface as a failed delegation.
 */
function isNotFoundError(error: unknown): boolean {
  if (error instanceof BackendApiError) return error.kind === "not-found";
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
      if (isNotFoundError(currentQuery.state.error)) return pollMs;
      const outcome = getOutcome(currentQuery.state.data);
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
    : getOutcome(query.data);

  return {
    ...query,
    outcome,
  };
}
