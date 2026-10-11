import { catalogsInfiniteQueryOptions } from "@clc/api/features/catalogs/queries";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import type { Catalog } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CatalogRow } from "#/components/catalogs/catalog-row";
import {
  isWithinNearbyCatalog,
  NearbyCatalog,
  nearbyQueryPolicy,
  useNearbyCatalog,
  useNearbyCatalogFilter,
} from "#/components/nearby-catalog";
import { Button } from "#/components/ui/button";
import { BackChevron } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { catalogsClient } from "#/lib/api/catalogs";
import { MarketplaceResourceNavigation } from "#/components/marketplace-resource-navigation";
import { CatalogSearchField } from "#/components/catalog-filter-controls";
import { useCatalogFilter } from "#/lib/navigation/use-catalog-filter";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";

export function CatalogsPage() {
  const { t } = useLingui();
  return (
    <div className="min-h-[100svh] space-y-5 bg-background px-6 pt-6 pb-bottom-nav">
      <BackChevron label={t`Wallet`} to="/" search={{ tab: "wallet" }} />
      <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
        <Trans>Catalogs</Trans>
      </h1>
      <NearbyCatalog>
        <CatalogList />
      </NearbyCatalog>
    </div>
  );
}

function CatalogList() {
  const { i18n, t } = useLingui();
  const auth = useAuthStatus();
  const storageOwner = useStorageOwner();
  const distanceOrigin = useDiscoveryDistanceOrigin(storageOwner ?? GUEST_STORAGE_OWNER);
  const scope = useNearbyCatalog();
  const filter = useNearbyCatalogFilter();
  const search = useCatalogFilter();
  const query = useInfiniteQuery({
    ...catalogsInfiniteQueryOptions(catalogsClient, {
      scope,
      q: search.result.ok ? search.result.filter.term : "",
    }),
    enabled: search.result.ok && !search.isDebouncing,
    ...nearbyQueryPolicy(scope),
  });
  const catalogs = query.data?.pages.flatMap((page) => page.catalogs) ?? [];
  // The backend's nearby endpoint is itself the complete 1,000 km result.
  // Narrower device preferences refine that nearest-first stream locally.
  const narrowingFilter = filter?.radiusKm === 1_000 ? undefined : filter;
  const visibleCatalogs = narrowingFilter
    ? catalogs.filter((catalog) =>
        isWithinNearbyCatalog(narrowingFilter, { lat: catalog.geoLat, lng: catalog.geoLng }),
      )
    : catalogs;
  const crossedDistanceBoundary =
    narrowingFilter !== undefined &&
    catalogs.some(
      (catalog) =>
        !isWithinNearbyCatalog(narrowingFilter, { lat: catalog.geoLat, lng: catalog.geoLng }),
    );
  const radiusLabel = filter
    ? t`${new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale).format(filter.radiusKm)} km`
    : null;
  return (
    <div className="space-y-3">
      <MarketplaceResourceNavigation current="catalogs" />
      <CatalogSearchField filter={search} label={t`Search catalogs`} />
      {auth.isAuthenticated && radiusLabel ? (
        <p className="text-sm text-muted-foreground">
          <Trans>
            Showing results within{" "}
            <Link
              className="underline underline-offset-4"
              to="/"
              search={{ tab: "settings" }}
              hash="visibility"
              hashScrollIntoView
            >
              {radiusLabel}
            </Link>{" "}
            of your saved{" "}
            <Link className="underline underline-offset-4" to="/settings/profile">
              profile location
            </Link>
            .
          </Trans>
        </p>
      ) : auth.isAuthenticated ? (
        <p className="text-sm text-muted-foreground">
          <Trans>
            Showing catalogs{" "}
            <Link
              className="underline underline-offset-4"
              to="/"
              search={{ tab: "settings" }}
              hash="visibility"
              hashScrollIntoView
            >
              globally
            </Link>
            .
          </Trans>
        </p>
      ) : null}
      {query.isPending ? (
        <p role="status">
          <Trans>Loading…</Trans>
        </p>
      ) : null}
      {query.isError ? (
        <div className="space-y-2">
          <p role="alert">
            <Trans>Couldn't load catalogs.</Trans>
          </p>
          <Button variant="outline" className="h-11 bg-card" onClick={() => void query.refetch()}>
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {query.isSuccess && visibleCatalogs.length === 0 ? (
        <p>
          <Trans>No catalogs found.</Trans>
        </p>
      ) : null}
      {visibleCatalogs.map((catalog) => (
        <CatalogDistanceRow key={catalog.id} catalog={catalog} filter={distanceOrigin} />
      ))}
      {query.hasNextPage && !crossedDistanceBoundary ? (
        <Button
          variant="outline"
          className="h-11 w-full bg-card"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function CatalogDistanceRow({
  catalog,
  filter,
}: {
  catalog: Catalog;
  filter: { lat: number; lng: number } | null | undefined;
}) {
  const { i18n, t } = useLingui();
  let label: string | undefined;
  const distanceMeters =
    catalog.distanceMeters ??
    (filter
      ? // The nearby response normally includes distance. Calculate it from
        // the same saved profile location if an older backend omits the field.
        haversineMeters(filter, { lat: catalog.geoLat, lng: catalog.geoLng })
      : null);
  if (distanceMeters !== null) {
    const display = formatDistance(distanceMeters);
    const value = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale, {
      minimumFractionDigits: display.fractionDigits,
      maximumFractionDigits: display.fractionDigits,
    }).format(display.value);
    label = display.unit === "m" ? t`${value} m` : t`${value} km`;
  }
  return <CatalogRow catalog={catalog} distanceLabel={label} />;
}
