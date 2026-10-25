import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import type {
  MarketplaceKind,
  MarketplaceResult,
  MarketplaceScope,
} from "@clc/core/features/marketplace/logic";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { RiArrowRightSLine } from "react-icons/ri";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { CreditableBrowseControl } from "#/components/creditable-browse-control";
import { MarketBar } from "#/components/market-bar";
import { MarketViewportSearchNotice } from "#/components/market-viewport-search-notice";
import { nearbyQueryPolicy, useNearbyCatalog } from "#/components/nearby-catalog";
import { RESOURCE_HUE, RESOURCE_ICON } from "#/components/resource-tone";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { WantPicture } from "#/components/wants/want-row";
import { PoolLogo, VoucherAvatar } from "#/components/wallet";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { marketplaceClient } from "#/lib/api/marketplace";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";

const ROW_TAG_LIMIT = 3;

const KIND_SCOPE: Record<MarketplaceKind, MarketplaceScope> = {
  offering: "offers",
  want: "wants",
  voucher: "vouchers",
  pool: "pools",
  catalog: "catalogs",
};

/** All: offers, vouchers, pools and catalogs in one list, under the same search as the map. */
export function MarketplacePage({
  creditableSearch,
  locationOwner = GUEST_STORAGE_OWNER,
}: {
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  locationOwner?: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const headingId = useId();
  const nearby = useNearbyCatalog();
  const distanceOrigin = useDiscoveryDistanceOrigin(locationOwner);
  const credit = useCreditableBrowse(creditableSearch);
  const filter = useMarketFilter(useStorageOwner(), creditableSearch !== undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const parsed = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const query = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, {
      perPage: 20,
      q: parsed.term,
      tags: parsed.tags,
      tagMatch: parsed.tagMatch,
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
  const rows = query.data?.pages.flatMap((page) => page.results) ?? [];
  const showResults = filter.result.ok && !credit.blocksResults;
  const hasMore = showResults && query.hasNextPage && !query.isFetchNextPageError;
  const facets = query.data?.pages[0]?.tagFacets ?? [];
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !query.isFetchingNextPage) void query.fetchNextPage();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, query.fetchNextPage, query.isFetchingNextPage]);

  return (
    <main className="min-h-[100svh] space-y-3 bg-background px-4 pb-bottom-nav">
      <h1 id={headingId} className="sr-only">
        <Trans>Marketplace</Trans>
      </h1>
      <MarketBar
        current="all"
        className="sticky top-0 z-20 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
        filter={filter}
        searchLabel={t`Search the marketplace`}
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
            title={<Trans>Filter marketplace</Trans>}
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
      <MarketViewportSearchNotice query={parsed.term} />
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
          <Trans>No marketplace results are available through your Credit pools.</Trans>
        </div>
      ) : !showResults ? null : query.isPending ? (
        <ListSkeleton label={<Trans>Loading marketplace…</Trans>} />
      ) : query.isError && !query.data ? (
        <div className="space-y-3 border border-border bg-card p-4" role="alert">
          <p className="text-sm text-muted-foreground">
            <Trans>Couldn't load marketplace results.</Trans>
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
      ) : (
        <div>
          {rows.length > 0 ? (
            <section
              aria-labelledby={headingId}
              aria-busy={filter.isDebouncing}
              className={cn(
                "border border-border bg-card",
                filter.isDebouncing && "opacity-60 transition-opacity",
              )}
            >
              {rows.map((row) => (
                <MarketplaceResultRow
                  key={`${row.kind}:${row.id}`}
                  row={row}
                  distanceOrigin={distanceOrigin}
                />
              ))}
            </section>
          ) : !hasMore && !query.isFetchingNextPage && !query.isFetchNextPageError ? (
            <div className="space-y-3 border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                <Trans>No marketplace results found.</Trans>
              </p>
              {filter.isFiltered ? (
                <Button variant="outline" tap onClick={filter.clear}>
                  <Trans>Clear filters</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
          <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
          {query.isFetchingNextPage ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              <Trans>Loading more…</Trans>
            </p>
          ) : null}
          {query.isFetchNextPageError ? (
            <div className="mt-3 space-y-3 border border-border bg-card p-4" role="alert">
              <p className="text-sm text-muted-foreground">
                <Trans>Couldn't load marketplace results.</Trans>
              </p>
              <Button
                variant="outline"
                tap
                pending={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

function MarketplaceResultRow({
  row,
  distanceOrigin,
}: {
  row: MarketplaceResult;
  distanceOrigin: { lat: number; lng: number } | null | undefined;
}) {
  const { i18n, t } = useLingui();
  const scope = KIND_SCOPE[row.kind];
  const Icon = RESOURCE_ICON[scope];
  const symbol =
    row.kind === "voucher" ? row.symbol : row.kind === "offering" ? row.voucherSymbol : null;
  // The nearby result carries its distance; otherwise it is measured from the
  // same origin the other lists use.
  const distanceMeters =
    row.distanceMeters ??
    (distanceOrigin ? haversineMeters(distanceOrigin, { lat: row.geoLat, lng: row.geoLng }) : null);
  let distanceLabel: string | null = null;
  if (distanceMeters !== null) {
    const display = formatDistance(distanceMeters);
    const value = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale, {
      minimumFractionDigits: display.fractionDigits,
      maximumFractionDigits: display.fractionDigits,
    }).format(display.value);
    distanceLabel = display.unit === "m" ? t`${value} m` : t`${value} km`;
  }
  const detail = [row.kind === "offering" ? row.voucherName : null, row.locationName, distanceLabel]
    .filter(Boolean)
    .join(" · ");
  const className =
    "flex min-h-16 w-full items-center gap-3 border-b border-border p-3 text-start last:border-b-0 active:bg-muted";
  const content = (
    <>
      <ResultPicture row={row} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span dir="auto" className="truncate text-sm font-semibold">
            {row.name}
          </span>
          {symbol ? (
            <span dir="ltr" className="shrink-0 font-mono text-2xs text-muted-foreground">
              {symbol}
            </span>
          ) : null}
        </span>
        {detail ? (
          <span dir="auto" className="mt-1 block truncate text-xs text-muted-foreground">
            {detail}
          </span>
        ) : null}
        {/* The kind leads the chips, so the place and distance keep the full line. */}
        <span className="mt-1.5 flex gap-1 overflow-hidden">
          <Badge
            variant="outline"
            size="sm"
            className={cn("gap-1 border-(--hue) text-(--ink)", RESOURCE_HUE[scope])}
          >
            <Icon className="size-3" aria-hidden="true" />
            <ResultKind kind={row.kind} />
          </Badge>
          {row.tags.slice(0, ROW_TAG_LIMIT).map((tag) => (
            <TagBadge key={tag} tag={tag} size="sm" />
          ))}
          {row.tags.length > ROW_TAG_LIMIT ? (
            <span className="shrink-0 self-center text-2xs text-muted-foreground">
              +{row.tags.length - ROW_TAG_LIMIT}
            </span>
          ) : null}
        </span>
      </span>
      <RiArrowRightSLine
        className="size-5 shrink-0 text-muted-foreground rtl:-scale-x-100"
        aria-hidden="true"
      />
    </>
  );
  if (row.kind === "pool") {
    return (
      <Link to="/pools/$poolAddress" params={{ poolAddress: row.address }} className={className}>
        {content}
      </Link>
    );
  }
  if (row.kind === "catalog") {
    return (
      <Link to="/catalogs/$catalogId" params={{ catalogId: row.id }} className={className}>
        {content}
      </Link>
    );
  }
  if (row.kind === "want") {
    return (
      <Link
        to="/wants/$wantId"
        params={{ wantId: row.id }}
        search={{ from: "market" }}
        className={className}
      >
        {content}
      </Link>
    );
  }
  // An offer is bought through its voucher, so it opens the voucher's page.
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: row.kind === "offering" ? row.voucherAddress : row.address }}
      search={{ from: "market" }}
      className={className}
    >
      {content}
    </Link>
  );
}

/** Each kind keeps the picture its own list gives it. */
function ResultPicture({ row }: { row: MarketplaceResult }) {
  if (row.kind === "voucher") {
    return (
      <VoucherAvatar
        address={row.address}
        symbol={row.symbol ?? ""}
        iconUrl={row.imageUrl}
        size={44}
      />
    );
  }
  if (row.kind === "pool") {
    return <PoolLogo imageUrl={row.imageUrl} name={row.name} seed={row.address} size={44} />;
  }
  if (row.kind === "want") {
    return (
      <WantPicture
        want={{ imageUrl: row.imageUrl, markerIcon: row.markerIcon, markerColor: row.markerColor }}
        size="size-11"
      />
    );
  }
  const Icon = RESOURCE_ICON[KIND_SCOPE[row.kind]];
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden border border-border bg-card">
      {row.imageUrl ? (
        <ProgressiveImage src={row.imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

function ResultKind({ kind }: { kind: MarketplaceKind }) {
  if (kind === "offering") return <Trans>Offer</Trans>;
  if (kind === "want") return <Trans>Want</Trans>;
  if (kind === "voucher") return <Trans>Voucher</Trans>;
  if (kind === "pool") return <Trans>Pool</Trans>;
  return <Trans>Catalog</Trans>;
}
