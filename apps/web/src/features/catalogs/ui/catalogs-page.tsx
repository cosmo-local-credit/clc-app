import { catalogsInfiniteQueryOptions } from "@clc/api/features/catalogs/queries";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import type { Catalog } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CatalogRow } from "#/components/catalogs/catalog-row";
import {
  MissingLocationNotice,
  NearbyCatalog,
  isWithinNearbyCatalog,
  nearbyQueryPolicy,
  useNearbyCatalog,
  useNearbyCatalogFilter,
} from "#/components/nearby-catalog";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { catalogsClient } from "#/lib/api/catalogs";
import { MarketBar } from "#/components/market-bar";
import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { CreditableBrowseControl } from "#/components/creditable-browse-control";
import { useCatalogFilter } from "#/lib/navigation/use-catalog-filter";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { ListSkeleton } from "#/components/ui/list-skeleton";

export function CatalogsPage({
  creditableSearch,
}: {
  creditableSearch?: boolean | string | readonly (boolean | string)[];
}) {
  return (
    <NearbyCatalog allowMissingLocation>
      <div className="min-h-[100svh] space-y-5 bg-background px-4 pb-market-list">
        <h1 className="sr-only">
          <Trans>Catalogs</Trans>
        </h1>
        <CatalogList creditableSearch={creditableSearch} />
      </div>
    </NearbyCatalog>
  );
}

function CatalogList({
  creditableSearch,
}: {
  creditableSearch?: boolean | string | readonly (boolean | string)[];
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const auth = useAuthStatus();
  const storageOwner = useStorageOwner();
  const distanceOrigin = useDiscoveryDistanceOrigin(storageOwner ?? GUEST_STORAGE_OWNER);
  const scope = useNearbyCatalog();
  const filter = useNearbyCatalogFilter();
  const search = useCatalogFilter();
  const credit = useCreditableBrowse(creditableSearch);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useInfiniteQuery({
    ...catalogsInfiniteQueryOptions(catalogsClient, {
      scope: scope?.nearby ? scope.scope : undefined,
      nearby: scope?.nearby === true,
      q: search.result.ok ? search.result.filter.term : "",
      tags: search.result.ok ? search.result.filter.tags : [],
      tagMatch: search.result.ok ? search.result.filter.tagMatch : "any",
      ...(credit.enabled && credit.poolRefs ? { pools: credit.poolRefs } : {}),
    }),
    enabled: search.result.ok && !search.isDebouncing && !credit.blocksResults,
    ...nearbyQueryPolicy(scope),
  });
  const catalogs = query.data?.pages.flatMap((page) => page.catalogs) ?? [];
  // The backend's nearby endpoint is itself the complete 1,000 km result.
  // Narrower device preferences refine that nearest-first stream locally.
  const narrowingFilter = scope?.nearby === true && filter?.radiusKm === 1_000 ? undefined : filter;
  const visibleCatalogs = narrowingFilter
    ? catalogs.filter((catalog) =>
        isWithinNearbyCatalog(narrowingFilter, { lat: catalog.geoLat, lng: catalog.geoLng }),
      )
    : catalogs;
  const crossedDistanceBoundary =
    scope?.nearby === true &&
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
      <MarketBar
        current="catalogs"
        className="sticky top-0 z-20 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
        filter={search}
        searchLabel={t`Search catalogs`}
        credit={
          <CreditableBrowseControl
            part="control"
            state={credit}
            onChange={(checked) =>
              void navigate({
                to: "/market",
                search: (previous) => ({ ...previous, creditable: checked }),
              })
            }
            onClear={() =>
              void navigate({
                to: "/market",
                replace: true,
                search: (previous) => ({ ...previous, creditable: undefined }),
              })
            }
          />
        }
        filters={
          <CatalogFilterSheet
            filter={search}
            facets={query.data?.pages[0]?.tagFacets ?? []}
            title={<Trans>Filter catalogs</Trans>}
            facetTitle={<Trans>Tags</Trans>}
            showHeader={false}
            trigger="bar"
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            onApply={search.setFacets}
          />
        }
      />
      <MissingLocationNotice />
      <CreditableBrowseControl
        part="feedback"
        state={credit}
        onChange={(checked) =>
          void navigate({
            to: "/market",
            search: (previous) => ({ ...previous, creditable: checked }),
          })
        }
        onClear={() =>
          void navigate({
            to: "/market",
            replace: true,
            search: (previous) => ({ ...previous, creditable: undefined }),
          })
        }
      />
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
      {credit.enabled && credit.poolRefs?.length === 0 ? (
        <p>
          <Trans>No catalogs are available through your Credit pools.</Trans>
        </p>
      ) : credit.blocksResults ? null : query.isPending ? (
        <ListSkeleton shape="cards" label={<Trans>Loading…</Trans>} />
      ) : null}
      {!credit.blocksResults && query.isError ? (
        <div className="space-y-2">
          <p role="alert">
            <Trans>Couldn't load catalogs.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {!credit.blocksResults && query.isSuccess && visibleCatalogs.length === 0 ? (
        <p>
          <Trans>No catalogs found.</Trans>
        </p>
      ) : null}
      {!credit.blocksResults
        ? visibleCatalogs.map((catalog) => (
            <CatalogDistanceRow key={catalog.id} catalog={catalog} filter={distanceOrigin} />
          ))
        : null}
      {!credit.blocksResults && query.hasNextPage && !crossedDistanceBoundary ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
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
