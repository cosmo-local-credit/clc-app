import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { useDiscoveryLocation } from "#/lib/discovery-location";

type Coordinates = { lat: number; lng: number };

/**
 * The trustworthy origin for discovery distance labels.
 *
 * Signed-in people see distances from their saved profile location, even when
 * Visibility is Global. Guests may use a live or persisted device fix. IP and
 * country camera fallbacks never become distance origins.
 */
export function useDiscoveryDistanceOrigin(locationOwner: string): Coordinates | null {
  const auth = useAuthStatus();
  const profile = useAuthProfile({ enabled: auth.isAuthenticated });
  const { realFix } = useDiscoveryLocation(locationOwner);

  if (auth.isAuthenticated) {
    const lat = profile.data?.geoLat;
    const lng = profile.data?.geoLng;
    return coordinates(lat, lng);
  }

  return auth.isLoading ? null : realFix;
}

function coordinates(lat: unknown, lng: unknown): Coordinates | null {
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  ) {
    return { lat, lng };
  }
  return null;
}
