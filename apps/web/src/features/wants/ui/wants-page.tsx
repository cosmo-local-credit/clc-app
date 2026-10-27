import { wantsInfiniteQueryOptions } from "@clc/api/features/wants/queries";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { CreditableBrowseControl } from "#/components/creditable-browse-control";
import { MarketBar } from "#/components/market-bar";
import { MarketEmptyMessage } from "#/components/market-empty-message";
import { MarketViewportSearchNotice } from "#/components/market-viewport-search-notice";
import { nearbyQueryPolicy, useNearbyCatalog } from "#/components/nearby-catalog";
import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { wantsClient } from "#/lib/api/wants";
import { WantRow } from "#/components/wants/want-row";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

export function WantsPage({
  creditableSearch,
}: {
  creditableSearch?: boolean | string | readonly (boolean | string)[];
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const nearby = useNearbyCatalog();
  const credit = useCreditableBrowse(creditableSearch);
  const storageOwner = useStorageOwner();
  const filter = useMarketFilter(storageOwner, creditableSearch !== undefined);
  const distanceOrigin = useDiscoveryDistanceOrigin(storageOwner ?? GUEST_STORAGE_OWNER);
  const parsed = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = useInfiniteQuery({
    ...wantsInfiniteQueryOptions(wantsClient, {
      perPage: 20,
      q: parsed.term,
      tags: parsed.tags,
      tagMatch: parsed.tagMatch,
      facets: true,
      nearby: nearby?.nearby === true,
      bounds: nearby?.bounds,
      ...(credit.enabled && credit.poolRefs ? { pools: credit.poolRefs } : {}),
    }),
    enabled: filter.result.ok && !filter.isDebouncing && !credit.blocksResults,
    ...nearbyQueryPolicy(nearby),
  });
  const wants = query.data?.pages.flatMap((page) => page.wants) ?? [];
  const facets = query.data?.pages[0]?.tagFacets ?? [];

  return (
    <main className="min-h-[100svh] space-y-3 bg-background px-4 pb-bottom-nav">
      <h1 className="sr-only">
        <Trans>Wants</Trans>
      </h1>
      <MarketBar
        current="wants"
        className="sticky top-0 z-20 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
        filter={filter}
        searchLabel={t`Search Wants`}
        credit={
          <CreditableBrowseControl
            part="control"
            state={credit}
            onChange={(checked) =>
              void navigate({
                to: "/market",
                search: (previous) => ({ ...previous, scope: "wants", creditable: checked }),
              })
            }
            onClear={() =>
              void navigate({
                to: "/market",
                replace: true,
                search: (previous) => ({ ...previous, scope: "wants", creditable: undefined }),
              })
            }
          />
        }
        filters={
          <CatalogFilterSheet
            filter={filter}
            facets={facets}
            title={<Trans>Filter Wants</Trans>}
            facetTitle={<Trans>Tags</Trans>}
            showHeader={false}
            trigger="bar"
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            onApply={(tags, tagMatch) => filter.setTags(tags, tagMatch)}
          />
        }
      />
      <CreditableBrowseControl
        part="feedback"
        state={credit}
        onChange={(checked) =>
          void navigate({ to: ".", search: (previous) => ({ ...previous, creditable: checked }) })
        }
        onClear={() =>
          void navigate({
            to: ".",
            replace: true,
            search: (previous) => ({ ...previous, creditable: undefined }),
          })
        }
      />
      <MarketViewportSearchNotice query={parsed.term} />
      {!filter.result.ok ? (
        <div className="space-y-3 border border-destructive bg-card p-4" role="alert">
          <p className="text-sm">
            <Trans>These filters aren't valid.</Trans>
          </p>
          <Button variant="outline" tap onClick={filter.clear}>
            <Trans>Clear filters</Trans>
          </Button>
        </div>
      ) : credit.blocksResults ? null : query.isPending ? (
        <ListSkeleton label={<Trans>Loading Wants…</Trans>} />
      ) : query.isError && !query.data ? (
        <div className="space-y-3 border border-border bg-card p-4" role="alert">
          <p className="text-sm">
            <Trans>Couldn't load Wants.</Trans>
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
      ) : wants.length ? (
        <section className="border border-border bg-card">
          {wants.map((want) => (
            <WantRow key={want.id} want={want} distanceOrigin={distanceOrigin} />
          ))}
        </section>
      ) : !query.isFetching &&
        !query.isPlaceholderData &&
        !query.isError &&
        !query.hasNextPage &&
        !filter.isDebouncing ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {filter.isFiltered || credit.enabled ? (
              <Trans>No Wants found.</Trans>
            ) : (
              <MarketEmptyMessage />
            )}
          </p>
          {filter.isFiltered ? (
            <Button variant="outline" tap onClick={filter.clear}>
              <Trans>Clear filters</Trans>
            </Button>
          ) : null}
        </div>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </main>
  );
}
