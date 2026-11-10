import { useQuery } from "@tanstack/react-query";
import {
  getTrackingOutcome,
  isTrackingNotFound,
  TRACKING_POLL_MS,
  type OtxTrackingOutcome,
} from "@clc/api/features/auth/client";
import { RelayerError } from "@clc/api/features/relayer/client";
import { authClient } from "#/lib/api/auth";

/**
 * A trackingId is issued as soon as a job is enqueued, before the async relayer
 * worker has written the corresponding OTX row. Polling in that window gets a
 * 404 that's "not written yet", not a tracking failure, so treat it the same as
 * a pending outcome. The predicate lives in @clc/api because the poller behind
 * the one-shot waits needs the same rule.
 *
 * The wait has no client-side deadline. A queue that is backed up can take
 * minutes to write the row, and calling that a failure invites a second
 * payment. A job that ended without a row is clc-core's to report: it answers
 * 410 with the reason, which is terminal on arrival.
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
      : { kind: "error", error: trackingErrorMessage(query.error) }
    : getOutcome(query.data);

  return {
    ...query,
    outcome,
  };
}

/**
 * What to show for a tracking call that failed.
 *
 * `RelayerError` is constructed with its code as the Error message, so reading
 * `message` would put "server_error" in front of the person. Its `description`
 * is the backend's own sentence — for a job clc-core knows was discarded, that
 * names the reason the request was refused.
 */
function trackingErrorMessage(error: unknown): string {
  if (error instanceof RelayerError && error.description) return error.description;
  if (error instanceof Error && error.message) return error.message;
  return "Tracking failed.";
}
