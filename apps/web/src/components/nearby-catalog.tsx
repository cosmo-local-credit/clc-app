import type { NearbyRequest } from "@clc/core/features/catalog/nearby";
import { Trans } from "@lingui/react/macro";
import { createContext, type ReactNode, useContext } from "react";
import { haversineMeters } from "@clc/core/lib/geo/distance";

import { useDiscoveryLocation } from "#/lib/discovery-location";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  catalogVisibilityRadiusKm,
  useHydratedCatalogVisibility,
} from "#/features/home/state/catalog-visibility";

// Only public discovery screens opt in. Other consumers of the same catalog
// hooks (wallet, pickers, and details) retain ordinary reads.
const PUBLIC_REQUEST: NearbyRequest = { nearby: false };
const NearbyCatalogContext = createContext<NearbyRequest | undefined>(undefined);

export type NearbyCatalogFilter = {
  lat: number;
  lng: number;
  radiusKm: number;
};

const NearbyCatalogFilterContext = createContext<NearbyCatalogFilter | undefined>(undefined);

export function useNearbyCatalog() {
  return useContext(NearbyCatalogContext);
}

export function useNearbyCatalogFilter() {
  return useContext(NearbyCatalogFilterContext);
}

export function isWithinNearbyCatalog(
  filter: NearbyCatalogFilter | undefined,
  coordinates: { lat?: number | null; lng?: number | null },
): boolean {
  if (!filter) return true;
  const { lat, lng } = coordinates;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return false;
  }
  return haversineMeters(filter, { lat, lng }) <= filter.radiusKm * 1_000;
}

export function filterNearbyCatalog<T extends { lat?: number | null; lng?: number | null }>(
  rows: readonly T[],
  filter: NearbyCatalogFilter | undefined,
): T[] {
  return filter ? rows.filter((row) => isWithinNearbyCatalog(filter, row)) : [...rows];
}

export function nearbyQueryKey<T extends readonly unknown[]>(
  key: T,
  scope: NearbyRequest | undefined,
) {
  return scope?.nearby ? ([...key, scope.scope] as const) : key;
}

// Reuse recent nearby snapshots on short return visits. Stale results refresh
// on entry, focus, or reconnect; account/location changes use separate keys.
export function nearbyQueryPolicy(scope: NearbyRequest | undefined) {
  return scope
    ? {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      }
    : {};
}

export function NearbyCatalog({ children }: { children: ReactNode }) {
  const { visibility, hydrated } = useHydratedCatalogVisibility();
  const auth = useAuthStatus();
  const radiusKm = catalogVisibilityRadiusKm(visibility);
  const profile = useAuthProfile({ enabled: radiusKm !== null && auth.isAuthenticated });
  const lat = profile.data?.geoLat;
  const lng = profile.data?.geoLng;

  if (!hydrated) {
    return (
      <p role="status" className="sr-only">
        <Trans>Loading…</Trans>
      </p>
    );
  }

  if (radiusKm === null) {
    return <GlobalCatalog>{children}</GlobalCatalog>;
  }

  if (auth.isLoading || (auth.isAuthenticated && profile.isPending)) {
    return (
      <p role="status" className="sr-only">
        <Trans>Loading…</Trans>
      </p>
    );
  }
  if (
    (auth.error && auth.state === "sessionCheckError") ||
    (auth.isAuthenticated && profile.isError)
  ) {
    return (
      <div className="space-y-3 p-6">
        <p>
          <Trans>We couldn't load your profile.</Trans>
        </p>
        <Button
          tap
          pending={auth.retrying || profile.isFetching}
          onClick={() => {
            auth.retry();
            void profile.refetch();
          }}
        >
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  }
  if (!auth.isAuthenticated) {
    return <GuestNearbyCatalog radiusKm={radiusKm}>{children}</GuestNearbyCatalog>;
  }
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return <GlobalCatalog>{children}</GlobalCatalog>;
  }

  const scope = `nearby:${auth.address?.toLowerCase()}:${auth.chainId}:${lat}:${lng}:${radiusKm}`;
  const filter = { lat, lng, radiusKm };
  // Remount on identity/location change so previous-data placeholders and local
  // selections cannot carry records from the old radius into the new screen.
  return (
    <NearbyCatalogContext.Provider key={scope} value={{ nearby: true, scope }}>
      <NearbyCatalogFilterContext.Provider value={filter}>
        {children}
      </NearbyCatalogFilterContext.Provider>
    </NearbyCatalogContext.Provider>
  );
}

/** Guests filter public rows locally; the server nearby mode requires a profile. */
function GuestNearbyCatalog({ children, radiusKm }: { children: ReactNode; radiusKm: number }) {
  const { origin, ipPending, explicitRequests } = useDiscoveryLocation(GUEST_STORAGE_OWNER);
  // A country/default camera is not evidence of the visitor's location.

  if (!origin) {
    if (ipPending && explicitRequests === 0) {
      return (
        <p role="status" className="sr-only">
          <Trans>Loading…</Trans>
        </p>
      );
    }
    return <GlobalCatalog>{children}</GlobalCatalog>;
  }

  return (
    <NearbyCatalogContext.Provider value={PUBLIC_REQUEST}>
      <NearbyCatalogFilterContext.Provider value={{ lat: origin.lat, lng: origin.lng, radiusKm }}>
        {children}
      </NearbyCatalogFilterContext.Provider>
    </NearbyCatalogContext.Provider>
  );
}

function GlobalCatalog({ children }: { children: ReactNode }) {
  return (
    <NearbyCatalogContext.Provider key="global" value={PUBLIC_REQUEST}>
      <NearbyCatalogFilterContext.Provider value={undefined}>
        {children}
      </NearbyCatalogFilterContext.Provider>
    </NearbyCatalogContext.Provider>
  );
}
