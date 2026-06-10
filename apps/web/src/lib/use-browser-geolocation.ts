import { useCallback, useRef, useState } from "react";

type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "granted"; lat: number; lng: number; accuracy: number }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

export function useBrowserGeolocation(): {
  state: GeoState;
  request: () => void;
} {
  const [state, setState] = useState<GeoState>({ status: "idle" });
  const requestIdRef = useRef(0);

  const request = useCallback(() => {
    const geolocation = navigator.geolocation;
    if (!geolocation) {
      setState({ status: "unavailable" });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState({ status: "requesting" });

    void navigator.permissions
      ?.query({ name: "geolocation" })
      .then((permission) => {
        if (requestIdRef.current !== requestId) return;
        if (permission.state === "denied") {
          setState({ status: "denied" });
        }
      })
      .catch(() => undefined);

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
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { state, request };
}
