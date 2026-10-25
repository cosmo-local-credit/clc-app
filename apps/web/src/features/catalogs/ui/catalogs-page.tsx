import { catalogsInfiniteQueryOptions } from "@clc/api/features/catalogs/queries";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import type { Catalog } from "@clc/core/features/catalogs/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CatalogRow } from "#/components/catalogs/catalog-row";
import { NearbyCatalog, nearbyQueryPolicy, useNearbyCatalog } from "#/components/nearby-catalog";
import { Button } from "#/components/ui/button";
import { catalogsClient } from "#/lib/api/catalogs";
import { MarketBar } from "#/components/market-bar";
import { MarketViewportSearchNotice } from "#/components/market-viewport-search-notice";
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
    <NearbyCatalog>
      <div className="min-h-[100svh] space-y-5 bg-background px-4 pb-bottom-nav">
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
  const { t } = useLingui();
  const navigate = useNavigate();
  const storageOwner = useStorageOwner();
  const distanceOrigin = useDiscoveryDistanceOrigin(storageOwner ?? GUEST_STORAGE_OWNER);
  const scope = useNearbyCatalog();
  const search = useCatalogFilter();
  const credit = useCreditableBrowse(creditableSearch);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useInfiniteQuery({
    ...catalogsInfiniteQueryOptions(catalogsClient, {
      scope: scope?.scope,
      nearby: scope?.nearby === true,
      bounds: scope?.bounds,
      q: search.result.ok ? search.result.filter.term : "",
      tags: search.result.ok ? search.result.filter.tags : [],
      tagMatch: search.result.ok ? search.result.filter.tagMatch : "any",
      ...(credit.enabled && credit.poolRefs ? { pools: credit.poolRefs } : {}),
    }),
    enabled: search.result.ok && !search.isDebouncing && !credit.blocksResults,
    ...nearbyQueryPolicy(scope),
  });
  const catalogs = query.data?.pages.flatMap((page) => page.catalogs) ?? [];
  const visibleCatalogs = catalogs;
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
      <MarketViewportSearchNotice query={search.result.ok ? search.result.filter.term : ""} />
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
      {!credit.blocksResults && query.hasNextPage ? (
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
