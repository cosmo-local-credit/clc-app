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
  } = {},
) {
  const enabled = options.enabled ?? true;
  const pollMs = options.pollMs ?? TRACKING_POLL_MS;

  const query = useQuery({
    queryKey: ["otx-track", trackingId],
    queryFn: () => trackOtx(trackingId!),
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
