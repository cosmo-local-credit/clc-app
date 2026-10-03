import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext } from "react";

import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAuthProfile } from "#/features/auth/hooks/use-profile";
import { onboardingSearch } from "#/lib/onboarding-search";

// Only Market, Pools browsing, and Posts opt in. Other consumers of the same
// catalog hooks (wallet, pickers, and details) retain ordinary reads.
const NearbyCatalogContext = createContext<string | undefined>(undefined);

export function useNearbyCatalog() {
  return useContext(NearbyCatalogContext);
}

export function nearbyQueryKey<T extends readonly unknown[]>(key: T, scope: string | undefined) {
  return scope ? ([...key, scope] as const) : key;
}

// Reuse recent nearby snapshots on short return visits. Stale results refresh
// on entry, focus, or reconnect; account/location changes use separate keys.
export function nearbyQueryPolicy(scope: string | undefined) {
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
  const auth = useAuthStatus();
  const profile = useAuthProfile({ enabled: auth.isAuthenticated });
  const lat = profile.data?.geoLat;
  const lng = profile.data?.geoLng;

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
    return (
      <div className="p-6">
        <Button asChild>
          <Link to="/onboarding" search={onboardingSearch("welcome")}>
            <Trans>Sign in or sign up</Trans>
          </Link>
        </Button>
      </div>
    );
  }
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return (
      <div className="space-y-3 p-6">
        <p>
          <Trans>Choose a location</Trans>
        </p>
        <Button asChild>
          <Link to="/settings/profile">
            <Trans>Edit profile</Trans>
          </Link>
        </Button>
      </div>
    );
  }

  const scope = `nearby:${auth.address?.toLowerCase()}:${auth.chainId}:${lat}:${lng}`;
  // Remount on identity/location change so previous-data placeholders and local
  // selections cannot carry records from the old radius into the new screen.
  return (
    <NearbyCatalogContext.Provider key={scope} value={scope}>
      {children}
    </NearbyCatalogContext.Provider>
  );
}
