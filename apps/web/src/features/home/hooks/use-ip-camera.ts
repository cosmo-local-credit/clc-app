import { useQuery } from "@tanstack/react-query";

import { resolveIPCamera } from "#/lib/ip-geolocation-client";

export const ipCameraQueryKeys = {
  all: ["ip-camera"] as const,
  current: () => [...ipCameraQueryKeys.all, "current"] as const,
};

/**
 * Coarse camera bootstrap from the visitor's IP.
 *
 * Local freshness overrides (see `docs/TANSTACK_QUERY.md`):
 * - `staleTime: Infinity` — an IP does not move during one session, so this is
 *   resolved once and reused across every home-tab remount.
 * - `gcTime: 24h` — keep it well beyond the 5-minute default for the same reason.
 * - `retry: 0` — this is the fallback path. Retrying would delay a camera the
 *   caller can already approximate, and it must never block basemap rendering.
 */
export function useIPCamera() {
  return useQuery({
    queryKey: ipCameraQueryKeys.current(),
    queryFn: ({ signal }) => resolveIPCamera(signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 24 * 60 * 60_000,
    retry: 0,
    refetchOnReconnect: false,
  });
}
