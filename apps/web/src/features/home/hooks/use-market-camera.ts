import { useMemo } from "react";
import { useDiscoveryLocation } from "#/lib/discovery-location";
import type { useBrowserGeolocation } from "#/lib/use-browser-geolocation";
import { EXPLICIT_CAMERA_RANK, type MarketCamera } from "#/features/home/logic/market-camera";

/**
 * Camera sources resolve by fixed rank, never by arrival order: a late IP
 * response must not drag the map off a real GPS fix.
 */
export const CAMERA_RANK = {
  /** The black location button — an explicit request, exempt from the latch. */
  explicit: EXPLICIT_CAMERA_RANK,
  /**
   * The voucher a link opened the market on. A shared card centres on its
   * voucher, not on wherever the viewer happens to be.
   */
  selectedVoucher: 1,
  /**
   * The location saved on the signed-in profile. The map opens there, and only
   * the location button moves it to a live fix.
   */
  savedProfile: 2,
  liveGps: 3,
  persistedGps: 4,
  ipCity: 5,
  countryDefault: 6,
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
  const { realFix, liveFix, ip, locationStatus, requestLocation, explicitRequests } =
    useDiscoveryLocation(owner);
  const camera = useMemo<MarketCamera | null>(() => {
    if (liveFix)
      return {
        lat: liveFix.lat,
        lng: liveFix.lng,
        zoom: REAL_FIX_ZOOM,
        rank: explicitRequests > 0 ? CAMERA_RANK.explicit : CAMERA_RANK.liveGps,
      };
    if (realFix)
      return {
        lat: realFix.lat,
        lng: realFix.lng,
        zoom: REAL_FIX_ZOOM,
        rank: CAMERA_RANK.persistedGps,
      };
    if (ip)
      return {
        lat: ip.lat,
        lng: ip.lng,
        zoom: ip.zoom,
        rank: ip.source === "ip-city" ? CAMERA_RANK.ipCity : CAMERA_RANK.countryDefault,
      };
    return null;
  }, [realFix, liveFix, ip, explicitRequests]);
  return {
    camera,
    realFix,
    userLocation: liveFix ? realFix : null,
    locationStatus,
    requestLocation,
  };
}
