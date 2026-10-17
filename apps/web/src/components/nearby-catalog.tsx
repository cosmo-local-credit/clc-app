import type { NearbyRequest } from "@clc/core/features/catalog/nearby";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext } from "react";
import { haversineMeters } from "@clc/core/lib/geo/distance";

import { useDiscoveryLocation } from "#/lib/discovery-location";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import {
  catalogVisibilityRadiusKm,
  useHydratedCatalogVisibility,
  useCatalogVisibilityStore,
} from "#/features/home/state/catalog-visibility";

// Only Catalogs, Market, Pools browsing, and Posts opt in. Other consumers of
// the same catalog hooks (wallet, pickers, and details) retain ordinary reads.
const PUBLIC_REQUEST: NearbyRequest = { nearby: false };
const NearbyCatalogContext = createContext<NearbyRequest | undefined>(undefined);

export type NearbyCatalogFilter = {
  lat: number;
  lng: number;
  radiusKm: number;
};

const NearbyCatalogFilterContext = createContext<NearbyCatalogFilter | undefined>(undefined);

// A member chose a distance but has no profile location to measure it from.
const NearbyCatalogMissingLocationContext = createContext(false);

export function useNearbyCatalog() {
  return useContext(NearbyCatalogContext);
}

export function useNearbyCatalogFilter() {
  return useContext(NearbyCatalogFilterContext);
}

export function useNearbyCatalogMissingLocation() {
  return useContext(NearbyCatalogMissingLocationContext);
}

/** Where a distance has nothing to start from: one notice, with the way to fix it. */
export function MissingLocationNotice({ className }: { className?: string }) {
  if (!useNearbyCatalogMissingLocation()) return null;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border border-border bg-card px-4 py-3",
        className,
      )}
      role="status"
    >
      <p className="min-w-0 text-sm">
        <Trans>Choose a location</Trans>
      </p>
      <Button asChild variant="outline" tap>
        <Link to="/settings/profile">
          <Trans>Edit profile</Trans>
        </Link>
      </Button>
    </div>
  );
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

export function NearbyCatalog({
  children,
  allowMissingLocation = false,
}: {
  children: ReactNode;
  /**
   * Browse everywhere, with a notice, rather than block the screen when a
   * member has a distance but no profile location. The market does; Posts
   * keeps the block.
   */
  allowMissingLocation?: boolean;
}) {
  const { visibility, hydrated } = useHydratedCatalogVisibility();
  const auth = useAuthStatus();
  const radiusKm = catalogVisibilityRadiusKm(visibility);
  const profile = useAuthProfile({ enabled: radiusKm !== null && auth.isAuthenticated });
  const lat = profile.data?.geoLat;
  const lng = profile.data?.geoLng;

  if (!hydrated) {
    return (
      <p className="p-6">
        <Trans>Loading…</Trans>
      </p>
    );
  }

  if (radiusKm === null) {
    return (
      <NearbyCatalogContext.Provider key="global" value={PUBLIC_REQUEST}>
        <NearbyCatalogFilterContext.Provider value={undefined}>
          {children}
        </NearbyCatalogFilterContext.Provider>
      </NearbyCatalogContext.Provider>
    );
  }

  if (auth.isLoading || (auth.isAuthenticated && profile.isPending)) {
    return (
      <p className="p-6">
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
          size="lg"
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
    if (allowMissingLocation) {
      return (
        <NearbyCatalogMissingLocationContext.Provider value>
          <NearbyCatalogContext.Provider key="missing-location" value={PUBLIC_REQUEST}>
            <NearbyCatalogFilterContext.Provider value={undefined}>
              {children}
            </NearbyCatalogFilterContext.Provider>
          </NearbyCatalogContext.Provider>
        </NearbyCatalogMissingLocationContext.Provider>
      );
    }
    return (
      <div className="space-y-3 p-6">
        <p>
          <Trans>Choose a location</Trans>
        </p>
        <Button asChild size="lg">
          <Link to="/settings/profile">
            <Trans>Edit profile</Trans>
          </Link>
        </Button>
      </div>
    );
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
  const { origin, locationStatus, requestLocation, ipPending } =
    useDiscoveryLocation(GUEST_STORAGE_OWNER);
  const setVisibility = useCatalogVisibilityStore((state) => state.setVisibility);
  // A country/default camera is not evidence of the visitor's location.

  if (!origin) {
    return (
      <div className="space-y-3 p-6">
        <p role="status">
          {ipPending && locationStatus === "idle" ? (
            <Trans>Loading…</Trans>
          ) : locationStatus === "denied" ? (
            <Trans>Location denied</Trans>
          ) : locationStatus === "unavailable" || locationStatus === "error" ? (
            <Trans>Location unavailable</Trans>
          ) : (
            <Trans>Choose a location</Trans>
          )}
        </p>
        <Button size="lg" pending={locationStatus === "requesting"} onClick={requestLocation}>
          <Trans>Use my location</Trans>
        </Button>
        <Button variant="outline" size="lg" onClick={() => setVisibility("global")}>
          <Trans>Global</Trans>
        </Button>
      </div>
    );
  }

  return (
    <NearbyCatalogContext.Provider value={PUBLIC_REQUEST}>
      <NearbyCatalogFilterContext.Provider value={{ lat: origin.lat, lng: origin.lng, radiusKm }}>
        {children}
      </NearbyCatalogFilterContext.Provider>
    </NearbyCatalogContext.Provider>
  );
}
