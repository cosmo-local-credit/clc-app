import { offeringsDiscoveryInfiniteQueryOptions } from "@clc/api/features/offerings/queries";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { CreditableBrowseControl } from "#/components/creditable-browse-control";
import { MarketBar } from "#/components/market-bar";
import { MarketEmptyMessage } from "#/components/market-empty-message";
import { MarketViewportSearchNotice } from "#/components/market-viewport-search-notice";
import { Button } from "#/components/ui/button";
import { nearbyQueryPolicy, useNearbyCatalog } from "#/components/nearby-catalog";
import { OfferingsPanel } from "#/components/offerings";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { offeringsClient } from "#/lib/api/offerings";

export function OffersPage({
  creditableSearch,
  locationOwner = GUEST_STORAGE_OWNER,
}: {
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  locationOwner?: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const nearby = useNearbyCatalog();
  const distanceOrigin = useDiscoveryDistanceOrigin(locationOwner);
  const credit = useCreditableBrowse(creditableSearch);
  const filter = usePersistedCatalogFilter(
    CATALOG_FILTER_PREFERENCE_NAMES.offers,
    useStorageOwner(),
    { externalFilterActive: creditableSearch !== undefined },
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const parsedFilter = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const query = useInfiniteQuery({
    ...offeringsDiscoveryInfiniteQueryOptions(offeringsClient, {
      perPage: 20,
      q: parsedFilter.term,
      tags: parsedFilter.tags,
      tagMatch: parsedFilter.tagMatch,
      facets: true,
      nearby: nearby?.nearby === true,
      scope: nearby?.scope,
      bounds: nearby?.bounds,
      ...(credit.enabled && credit.poolRefs ? { pools: credit.poolRefs } : {}),
    }),
    enabled:
      filter.result.ok &&
      !filter.isRestoringPreference &&
      !filter.isDebouncing &&
      !credit.blocksResults,
    ...nearbyQueryPolicy(nearby),
  });
  const visibleOfferings = query.data?.pages.flatMap((page) => page.offerings) ?? [];
  const viewQuery = useMemo(
    () => ({
      ...query,
      data: query.data
        ? {
            ...query.data,
            pages: [
              {
                ...query.data.pages[0],
                offerings: visibleOfferings,
              },
            ],
          }
        : undefined,
      hasNextPage: query.hasNextPage,
      isSuccess:
        query.isSuccess &&
        !query.isFetching &&
        !query.isPlaceholderData &&
        !query.hasNextPage &&
        !filter.isDebouncing &&
        !filter.isRestoringPreference,
    }),
    [query, visibleOfferings, filter.isDebouncing, filter.isRestoringPreference],
  );
  const facets = query.data?.pages[0]?.tagFacets ?? [];

  return (
    <main className="min-h-[100svh] space-y-3 bg-background px-4 pb-bottom-nav">
      <h1 className="sr-only">
        <Trans>Offers</Trans>
      </h1>
      <MarketBar
        current="offers"
        className="sticky top-0 z-20 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
        filter={filter}
        searchLabel={t`Search offers, vouchers, descriptions, or tags`}
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
            filter={filter}
            facets={facets}
            title={<Trans>Filter offers</Trans>}
            facetTitle={<Trans>Tags</Trans>}
            showHeader={false}
            trigger="bar"
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            onApply={filter.applyFacetFilters}
          />
        }
      />
      <CreditableBrowseControl
        part="feedback"
        state={credit}
        onChange={(checked) =>
          void navigate({
            to: ".",
            search: (previous) => ({ ...previous, creditable: checked }),
          })
        }
        onClear={() =>
          void navigate({
            to: ".",
            replace: true,
            search: (previous) => ({ ...previous, creditable: undefined }),
          })
        }
      />
      <MarketViewportSearchNotice query={parsedFilter.term} />
      {!filter.result.ok ? (
        <div className="space-y-3 border border-destructive bg-card p-3" role="alert">
          <p className="text-sm">
            <Trans>These filters aren't valid.</Trans>
          </p>
          <Button variant="outline" tap onClick={filter.clear}>
            <Trans>Clear filters</Trans>
          </Button>
        </div>
      ) : null}
      {credit.enabled && credit.poolRefs?.length === 0 ? (
        <div className="border border-border bg-card p-4 text-sm text-muted-foreground">
          <Trans>No offers are available through your Credit pools.</Trans>
        </div>
      ) : filter.result.ok && !credit.blocksResults ? (
        <OfferingsPanel
          query={viewQuery}
          emptyState={
            filter.isFiltered || credit.enabled ? (
              <Trans>No offers match this search.</Trans>
            ) : (
              <MarketEmptyMessage />
            )
          }
          showVoucher
          showVoucherName
          showLocation
          distanceOrigin={distanceOrigin}
          directNavigation
        />
      ) : null}
    </main>
  );
}
