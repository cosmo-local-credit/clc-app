import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type PersistedLocation,
  readPersistedLocation,
  writePersistedLocation,
} from "#/features/home/api/last-location-storage";
import { EXPLICIT_CAMERA_RANK, type MarketCamera } from "#/features/home/ui/market-map";
import { useBrowserGeolocation } from "#/lib/use-browser-geolocation";
import { useIPCamera } from "./use-ip-camera";

/**
 * Camera sources resolve by fixed rank, never by arrival order: a late IP
 * response must not drag the map off a real GPS fix.
 */
export const CAMERA_RANK = {
  /** The black location button — an explicit request, exempt from the latch. */
  explicit: EXPLICIT_CAMERA_RANK,
  liveGps: 1,
  persistedGps: 2,
  ipCity: 3,
  countryDefault: 4,
} as const;

export const REAL_FIX_ZOOM = 14;

type Coordinates = { lat: number; lng: number };

export type MarketCameraResult = {
  camera: MarketCamera | null;
  /**
   * Only a live or persisted GPS fix. Distance is never labelled from an IP
   * city or a country centroid, which would be a fabricated number.
   */
  realFix: Coordinates | null;
  /** The "you are here" dot: a live fix only, never a stored one. */
  userLocation: Coordinates | null;
  locationStatus: ReturnType<typeof useBrowserGeolocation>["state"]["status"];
  requestLocation: () => void;
};

/**
 * @param owner Who the stored fix belongs to. A connected wallet is NOT enough
 *   — `docs/AUTH.md` defines authentication as a connected wallet *plus* a
 *   matching backend session, so the caller resolves this and passes it down.
 *   A lapsed session must fall back to the guest scope.
 */
export function useMarketCamera(owner: string): MarketCameraResult {
  const geolocation = useBrowserGeolocation({ autoRequestIfGranted: true });
  const ipCamera = useIPCamera();
  // Stored with the owner it was read for, so a scope change drops it in the
  // same render rather than leaking the previous owner for one frame.
  const [persistedFor, setPersistedFor] = useState<{
    owner: string;
    value: PersistedLocation | null;
  } | null>(null);
  const [explicitRequests, setExplicitRequests] = useState(0);
  const lastWrittenRef = useRef<string | null>(null);

  // Rank 2 is read after the client boundary so the server and the hydration
  // render start from the same camera and no mismatch warning is emitted.
  useEffect(() => {
    setPersistedFor({ owner, value: readPersistedLocation(owner) });
  }, [owner]);

  const persisted = persistedFor?.owner === owner ? persistedFor.value : null;

  const gps = geolocation.state.status === "granted" ? geolocation.state : null;

  // Only a real getCurrentPosition success is ever stored.
  useEffect(() => {
    if (!gps) return;
    const signature = `${owner}:${gps.lat},${gps.lng},${gps.accuracy}`;
    if (lastWrittenRef.current === signature) return;
    lastWrittenRef.current = signature;
    writePersistedLocation({
      owner,
      lat: gps.lat,
      lng: gps.lng,
      accuracy: gps.accuracy,
      capturedAt: new Date().toISOString(),
    });
  }, [gps, owner]);

  const { request } = geolocation;
  const requestLocation = useCallback(() => {
    // Counting presses gives the camera a fresh identity each time, so a
    // repeat press recentres even when the coordinates are unchanged.
    setExplicitRequests((count) => count + 1);
    request();
  }, [request]);

  const gpsLat = gps?.lat;
  const gpsLng = gps?.lng;
  const ip = ipCamera.data;

  const camera = useMemo<MarketCamera | null>(() => {
    if (gpsLat !== undefined && gpsLng !== undefined) {
      return {
        lat: gpsLat,
        lng: gpsLng,
        zoom: REAL_FIX_ZOOM,
        rank: explicitRequests > 0 ? CAMERA_RANK.explicit : CAMERA_RANK.liveGps,
      };
    }
    if (persisted) {
      return {
        lat: persisted.lat,
        lng: persisted.lng,
        zoom: REAL_FIX_ZOOM,
        rank: CAMERA_RANK.persistedGps,
      };
    }
    if (ip) {
      return {
        lat: ip.lat,
        lng: ip.lng,
        zoom: ip.zoom,
        rank: ip.source === "ip-city" ? CAMERA_RANK.ipCity : CAMERA_RANK.countryDefault,
      };
    }
    return null;
  }, [gpsLat, gpsLng, persisted, ip, explicitRequests]);

  const realFix = useMemo<Coordinates | null>(() => {
    if (gpsLat !== undefined && gpsLng !== undefined) return { lat: gpsLat, lng: gpsLng };
    if (persisted) return { lat: persisted.lat, lng: persisted.lng };
    return null;
  }, [gpsLat, gpsLng, persisted]);

  const userLocation = useMemo<Coordinates | null>(
    () => (gpsLat !== undefined && gpsLng !== undefined ? { lat: gpsLat, lng: gpsLng } : null),
    [gpsLat, gpsLng],
  );

  return {
    camera,
    realFix,
    userLocation,
    locationStatus: geolocation.state.status,
    requestLocation,
  };
}
