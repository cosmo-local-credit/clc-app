import { useCallback, useEffect, useRef, useState } from "react";

type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; lat: number; lng: number; accuracy: number }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export type BrowserGeolocationOptions = {
  /**
   * Probe the Permissions API on mount and fetch a position immediately, but
   * only when it resolves to `granted`. Anything else — `prompt`, `denied`, a
   * missing Permissions API, or a rejected query — does nothing.
   *
   * WebKit/iOS rejects `query({ name: "geolocation" })`, and calling GPS on
   * that rejection would risk an unprompted permission dialog. Persisted
   * location is intentionally the primary returning-user path there.
   *
   * Defaults to false so the onboarding location picker stays tap-only.
   */
  autoRequestIfGranted?: boolean;
};

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
};

export function useBrowserGeolocation(options: BrowserGeolocationOptions = {}): {
  state: GeoState;
  request: () => void;
} {
  const { autoRequestIfGranted = false } = options;
  const [state, setState] = useState<GeoState>({ status: "idle" });
  const requestIdRef = useRef(0);
  const autoRequestedRef = useRef(false);

  // Shared by the automatic and explicit paths so both get the same request
  // IDs, stale-result protection, error mapping, and position options.
  const runPositionRequest = useCallback((): number | null => {
    const geolocation = navigator.geolocation;
    if (!geolocation) {
      setState({ status: "unavailable" });
      return null;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({ status: "requesting" });

    geolocation.getCurrentPosition(
      (position) => {
        if (requestIdRef.current !== requestId) return;
        setState({
          status: "granted",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        if (requestIdRef.current !== requestId) return;
        if (error.code === error.PERMISSION_DENIED) {
          setState({ status: "denied" });
          return;
        }
        if (error.code === error.POSITION_UNAVAILABLE) {
          setState({ status: "unavailable" });
          return;
        }
        setState({ status: "error", message: error.message });
      },
      POSITION_OPTIONS,
    );

    return requestId;
  }, []);

  const request = useCallback(() => {
    const requestId = runPositionRequest();
    if (requestId === null) return;

    // Surface a known denial without waiting for the GPS callback.
    void navigator.permissions
      ?.query({ name: "geolocation" })
      .then((permission) => {
        if (requestIdRef.current !== requestId) return;
        if (permission.state === "denied") {
          setState({ status: "denied" });
        }
      })
      .catch(() => undefined);
  }, [runPositionRequest]);

  useEffect(() => {
    if (!autoRequestIfGranted || autoRequestedRef.current) return;

    const permissions = navigator.permissions;
    if (!permissions?.query) return;

    let cancelled = false;
    void permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (cancelled || autoRequestedRef.current) return;
        if (permission.state !== "granted") return;
        autoRequestedRef.current = true;
        runPositionRequest();
      })
      // A rejected probe must never fall through to getCurrentPosition.
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [autoRequestIfGranted, runPositionRequest]);

  return { state, request };
}
