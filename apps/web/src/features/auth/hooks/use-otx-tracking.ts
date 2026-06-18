import { useQuery } from "@tanstack/react-query";
import {
  getTrackingOutcome,
  trackOtx,
  TRACKING_POLL_MS,
  type OtxTrackingOutcome,
} from "#/features/auth/api/client";

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
      const outcome = getTrackingOutcome(currentQuery.state.data);
      return outcome.kind === "pending" ? pollMs : false;
    },
  });

  const outcome: OtxTrackingOutcome = query.isError
    ? {
        kind: "error",
        error: query.error instanceof Error ? query.error.message : "Tracking failed.",
      }
    : getTrackingOutcome(query.data);

  return {
    ...query,
    outcome,
  };
}
