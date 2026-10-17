import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { formatDistance } from "@clc/core/lib/geo/distance";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RiBookOpenLine, RiCoupon3Line, RiGroupLine, RiStore2Line } from "react-icons/ri";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { CreditableBrowseControl } from "#/components/creditable-browse-control";
import { MarketBar } from "#/components/market-bar";
import {
  isWithinNearbyCatalog,
  nearbyQueryPolicy,
  useNearbyCatalog,
  useNearbyCatalogFilter,
} from "#/components/nearby-catalog";
import { Button } from "#/components/ui/button";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { marketplaceClient } from "#/lib/api/marketplace";

export function MarketplacePage({
  creditableSearch,
}: {
  creditableSearch?: boolean | string | readonly (boolean | string)[];
}) {
  const { i18n, t } = useLingui();
  const navigate = useNavigate();
  const nearby = useNearbyCatalog();
  const visibility = useNearbyCatalogFilter();
  const credit = useCreditableBrowse(creditableSearch);
  const filter = usePersistedCatalogFilter(
    CATALOG_FILTER_PREFERENCE_NAMES.market,
    useStorageOwner(),
    { externalFilterActive: creditableSearch !== undefined },
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const parsed = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const query = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, {
      perPage: 20,
      q: parsed.term,
      tags: parsed.tags,
      tagMatch: parsed.tagMatch,
      facets: true,
      nearby: !!nearby,
      scope: nearby,
      ...(credit.enabled && credit.poolRefs ? { pools: credit.poolRefs } : {}),
    }),
    enabled:
      filter.result.ok &&
      !filter.isRestoringPreference &&
      !filter.isDebouncing &&
      !credit.blocksResults,
    ...nearbyQueryPolicy(nearby),
  });
  const rows = (query.data?.pages.flatMap((page) => page.results) ?? []).filter((row) =>
    isWithinNearbyCatalog(visibility, { lat: row.geoLat, lng: row.geoLng }),
  );
  const crossedDistanceBoundary =
    visibility !== undefined &&
    (query.data?.pages.some((page) =>
      page.results.some(
        (row) => !isWithinNearbyCatalog(visibility, { lat: row.geoLat, lng: row.geoLng }),
      ),
    ) ??
      false);
  const facets = query.data?.pages[0]?.tagFacets ?? [];

  return (
    <main className="min-h-[100svh] space-y-4 bg-background px-4 pb-bottom-nav">
      <h1 className="sr-only">
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
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
          <Trans>No marketplace results are available through your Credit pools.</Trans>
        </p>
      ) : credit.blocksResults ? null : query.isPending ? (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground" role="status">
          <Trans>Loading marketplace…</Trans>
        </p>
      ) : query.isError ? (
        <div className="space-y-3 border border-destructive bg-card p-4" role="alert">
          <p>
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
      ) : rows.length === 0 && query.isSuccess ? (
        <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
          <Trans>No marketplace results found.</Trans>
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <MarketplaceResultRow
              key={`${row.kind}:${row.id}`}
              row={row}
              locale={i18n.locales?.[0] ?? i18n.locale}
            />
          ))}
        </div>
      )}
      {query.hasNextPage && !crossedDistanceBoundary && !credit.blocksResults ? (
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
    </main>
  );
}

function MarketplaceResultRow({ row, locale }: { row: MarketplaceResult; locale: string }) {
  const Icon =
    row.kind === "offering"
      ? RiStore2Line
      : row.kind === "voucher"
        ? RiCoupon3Line
        : row.kind === "pool"
          ? RiGroupLine
          : RiBookOpenLine;
  const tint =
    row.kind === "offering"
      ? "border-offer/50 bg-offer/10"
      : row.kind === "voucher"
        ? "border-voucher/60 bg-voucher/10"
        : row.kind === "pool"
          ? "border-info/50 bg-info/10"
          : "border-success/50 bg-success/10";
  const distance = row.distanceMeters === null ? null : formatDistance(row.distanceMeters);
  const distanceLabel = distance
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: distance.fractionDigits }).format(distance.value)} ${distance.unit}`
    : null;
  const content = (
    <span className={`flex min-h-24 items-center gap-3 border p-3 ${tint}`}>
      <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden border border-border bg-card">
        {row.imageUrl ? (
          <ProgressiveImage src={row.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <Icon className="size-6" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">
          <ResultKind kind={row.kind} />
        </span>
        <span dir="auto" className="block break-words text-sm font-semibold">
          {row.name}
        </span>
        {row.kind === "offering" && row.voucherName ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            {row.voucherName}
            {row.voucherSymbol ? ` · ${row.voucherSymbol}` : ""}
          </span>
        ) : null}
        {row.locationName || distanceLabel ? (
          <span className="mt-1 block text-xs text-muted-foreground">
            {[row.locationName, distanceLabel].filter(Boolean).join(" · ")}
          </span>
        ) : null}
        {row.tags.length > 0 ? (
          <span className="mt-2 flex flex-wrap gap-1">
            {row.tags.slice(0, 3).map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
  if (row.kind === "catalog")
    return (
      <Link to="/catalogs/$catalogId" params={{ catalogId: row.id }}>
        {content}
      </Link>
    );
  if (row.kind === "pool")
    return (
      <Link to="/pools/$poolAddress" params={{ poolAddress: row.address }}>
        {content}
      </Link>
    );
  const voucherAddress = row.kind === "offering" ? row.voucherAddress : row.address;
  return (
    <Link to="/vouchers/$voucherAddress" params={{ voucherAddress }}>
      {content}
    </Link>
  );
}

function ResultKind({ kind }: { kind: MarketplaceResult["kind"] }) {
  if (kind === "offering") return <Trans>Offer</Trans>;
  if (kind === "voucher") return <Trans>Voucher</Trans>;
  if (kind === "pool") return <Trans>Pool</Trans>;
  return <Trans>Catalog</Trans>;
}
