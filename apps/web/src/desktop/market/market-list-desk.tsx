import { marketplaceInfiniteQueryOptions } from "@clc/api/features/marketplace/queries";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import type { MarketplaceKind, MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { formatOfferingDisplayValue, formatOfferingPrice } from "@clc/core/features/market/logic";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { CreditableBrowseControl, hasCreditFeedback } from "#/components/creditable-browse-control";
import { MarketEmptyMessage } from "#/components/market-empty-message";
import { nearbyQueryPolicy, useNearbyCatalog } from "#/components/nearby-catalog";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useMarketFilter } from "#/features/home/hooks/use-market-filter";
import { marketplaceClient } from "#/lib/api/marketplace";
import type { MarketListScope } from "#/lib/navigation/marketplace-search";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { useWantSheetSelection } from "#/lib/navigation/use-want-sheet-selection";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskSplit } from "#/desktop/ui/inspector";
import { DeskCanvas } from "#/desktop/ui/page";
import { MarketAvatar, MarketKindBadge, marketSeedGradient } from "#/desktop/market/market-bits";
import { MarketDeskToolbar } from "#/desktop/market/market-toolbar";
import { MarketPlacePanel } from "#/desktop/market/place-panel";

const LIST_KINDS: Record<Exclude<MarketListScope, "all">, readonly MarketplaceKind[]> = {
  offers: ["offering"],
  wants: ["want"],
  vouchers: ["voucher"],
  pools: ["pool"],
  catalogs: ["catalog"],
};

export function MarketListDesk({
  scope,
  creditableSearch,
  locationOwner = GUEST_STORAGE_OWNER,
}: {
  scope: MarketListScope;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  locationOwner?: string;
}) {
  const navigate = useNavigate();
  const nearby = useNearbyCatalog();
  const distanceOrigin = useDiscoveryDistanceOrigin(locationOwner);
  const credit = useCreditableBrowse(creditableSearch);
  const filter = useMarketFilter(useStorageOwner(), creditableSearch !== undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const parsed = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const kinds = scope === "all" ? undefined : LIST_KINDS[scope];
  const query = useInfiniteQuery({
    ...marketplaceInfiniteQueryOptions(marketplaceClient, {
      perPage: 20,
      q: parsed.term,
      tags: parsed.tags,
      tagMatch: parsed.tagMatch,
      kinds,
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
  const facets = query.data?.pages[0]?.tagFacets ?? [];
  const voucher = useVoucherSheetSelection();
  const want = useWantSheetSelection();
  const open = voucher.voucher !== null || want.want !== null;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const hasMore = query.hasNextPage && !query.isFetchNextPageError;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !query.isFetchingNextPage) void query.fetchNextPage();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, query.fetchNextPage, query.isFetchingNextPage]);

  const changeCredit = (checked: boolean) =>
    void navigate({
      to: "/market",
      search: (previous) => ({ ...previous, creditable: checked }),
    });
  const clearCredit = () =>
    void navigate({
      to: "/market",
      replace: true,
      search: (previous) => ({ ...previous, creditable: undefined }),
    });

  const distanceOf = (row: MarketplaceResult) => {
    const meters =
      row.distanceMeters ??
      (distanceOrigin
        ? haversineMeters(distanceOrigin, { lat: row.geoLat, lng: row.geoLng })
        : null);
    return meters;
  };

  const filtered = filter.isFiltered || credit.enabled;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DeskSplit
        dimmed={open}
        main={
          <DeskCanvas width="full">
            <h1 className="sr-only">
              <Trans>Market</Trans>
            </h1>
            <MarketDeskToolbar
              layout="page"
              scope={scope}
              filter={filter}
              facets={facets}
              filtersOpen={filtersOpen}
              onFiltersOpenChange={setFiltersOpen}
              credit={credit}
              onCredit={changeCredit}
              count={filtered && query.data ? rows.length : undefined}
            />
            {hasCreditFeedback(credit) ? (
              <CreditableBrowseControl
                part="feedback"
                state={credit}
                onChange={changeCredit}
                onClear={clearCredit}
              />
            ) : null}
            <div>
              <ListBody
                scope={scope}
                rows={rows}
                pending={query.isPending}
                error={query.isError && !query.data}
                fetching={query.isFetching}
                onRetry={() => void query.refetch()}
                filtered={filtered}
                onClear={filter.clear}
                distanceOf={distanceOf}
                selectedKey={
                  voucher.voucher
                    ? `voucher:${voucher.voucher.toLowerCase()}`
                    : want.want
                      ? `want:${want.want}`
                      : null
                }
                onOpenVoucher={voucher.open}
                onOpenWant={want.open}
                sheetOpen={open}
              />
              <div ref={loadMoreRef} className="h-px" />
              {query.isFetchingNextPage ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  <Trans>Loading more…</Trans>
                </p>
              ) : null}
            </div>
          </DeskCanvas>
        }
        side={
          open ? (
            <aside className="flex min-h-0 w-[380px] shrink-0 flex-col border-border border-s bg-card">
              <MarketPlacePanel realFix={distanceOrigin} />
            </aside>
          ) : null
        }
      />
    </div>
  );
}

function ListBody({
  scope,
  rows,
  pending,
  error,
  fetching,
  onRetry,
  filtered,
  onClear,
  distanceOf,
  selectedKey,
  onOpenVoucher,
  onOpenWant,
  sheetOpen,
}: {
  scope: MarketListScope;
  rows: MarketplaceResult[];
  pending: boolean;
  error: boolean;
  fetching: boolean;
  onRetry: () => void;
  filtered: boolean;
  onClear: () => void;
  distanceOf: (row: MarketplaceResult) => number | null;
  selectedKey: string | null;
  onOpenVoucher: (address: `0x${string}`) => void;
  onOpenWant: (id: string) => void;
  sheetOpen: boolean;
}) {
  const { t, i18n } = useLingui();
  if (error) {
    return (
      <div className="space-y-3 border border-border bg-card p-4" role="alert">
        <p className="text-sm text-muted-foreground">
          <Trans>Couldn't load marketplace results.</Trans>
        </p>
        <Button variant="outline" tap pending={fetching} onClick={onRetry}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  if (pending) {
    return <p className="text-sm text-muted-foreground">{t`Loading marketplace…`}</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="space-y-3 border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {filtered ? <Trans>No marketplace results found.</Trans> : <MarketEmptyMessage />}
        </p>
        {filtered ? (
          <Button variant="outline" tap onClick={onClear}>
            <Trans>Clear filters</Trans>
          </Button>
        ) : null}
      </div>
    );
  }
  if (scope === "offers") {
    return (
      <div className="grid grid-cols-4 gap-4">
        {rows.map((row) =>
          row.kind === "offering" && row.voucherAddress ? (
            <OfferTile
              key={row.id}
              row={row}
              voucherAddress={row.voucherAddress}
              distance={distanceLabel(distanceOf(row), i18n.locale, t)}
            />
          ) : null,
        )}
      </div>
    );
  }

  const columns = columnsFor(scope, distanceOf, i18n.locale, t);
  return (
    <DeskTable
      label={t`Market`}
      rows={rows}
      columns={columns}
      rowKey={selectionKey}
      selectedKey={selectedKey}
      empty={<Trans>No marketplace results found.</Trans>}
      renderRow={(row, props, cells) => {
        if (row.kind === "pool" && row.address) {
          return (
            <Link to="/pools/$poolAddress" params={{ poolAddress: row.address }} {...props}>
              {cells}
            </Link>
          );
        }
        if (row.kind === "catalog") {
          return (
            <Link to="/catalogs/$catalogId" params={{ catalogId: row.id }} {...props}>
              {cells}
            </Link>
          );
        }
        if (row.kind === "offering" && row.voucherAddress) {
          return (
            <Link
              to="/vouchers/$voucherAddress"
              params={{ voucherAddress: row.voucherAddress }}
              search={{ from: "market" }}
              {...props}
            >
              {cells}
            </Link>
          );
        }
        return (
          <button
            type="button"
            {...props}
            onFocus={(event) => {
              if (!sheetOpen || !event.currentTarget.matches(":focus-visible")) return;
              openRow(row, onOpenVoucher, onOpenWant);
            }}
            onClick={() => openRow(row, onOpenVoucher, onOpenWant)}
          >
            {cells}
          </button>
        );
      }}
    />
  );
}

function openRow(
  row: MarketplaceResult,
  onOpenVoucher: (address: `0x${string}`) => void,
  onOpenWant: (id: string) => void,
) {
  if (row.kind === "voucher") {
    const address = parseVoucherAddress(row.address);
    if (address) onOpenVoucher(address);
  }
  if (row.kind === "want") onOpenWant(row.id);
}

function selectionKey(row: MarketplaceResult) {
  if ((row.kind === "voucher" || row.kind === "pool" || row.kind === "offering") && row.address) {
    return `${row.kind}:${row.address.toLowerCase()}`;
  }
  return `${row.kind}:${row.id}`;
}

function columnsFor(
  scope: MarketListScope,
  distanceOf: (row: MarketplaceResult) => number | null,
  locale: string,
  t: ReturnType<typeof useLingui>["t"],
): DeskColumn<MarketplaceResult>[] {
  const name: DeskColumn<MarketplaceResult> = {
    id: "name",
    header:
      scope === "pools" ? (
        <Trans>Pool</Trans>
      ) : scope === "vouchers" ? (
        <Trans>Voucher</Trans>
      ) : scope === "catalogs" ? (
        <Trans>Catalog</Trans>
      ) : scope === "wants" ? (
        <Trans>Want</Trans>
      ) : (
        <Trans>Name</Trans>
      ),
    width: "minmax(0,2fr)",
    sortValue: (row) => row.name,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <MarketAvatar
          name={row.name}
          seed={row.address ?? row.id}
          kind={row.kind === "voucher" ? row.voucherKind : row.kind}
          size="sm"
        />
        <span dir="auto" className="min-w-0 truncate font-semibold">
          {row.name}
        </span>
      </span>
    ),
  };
  const place: DeskColumn<MarketplaceResult> = {
    id: "place",
    header: <Trans>Location</Trans>,
    sortValue: (row) => row.locationName ?? "",
    cell: (row) => <span dir="auto">{row.locationName}</span>,
  };
  const distance: DeskColumn<MarketplaceResult> = {
    id: "distance",
    header: <Trans>Distance</Trans>,
    align: "end",
    width: "7rem",
    sortValue: (row) => distanceOf(row) ?? Number.POSITIVE_INFINITY,
    cell: (row) => (
      <span className="font-mono font-semibold">{distanceLabel(distanceOf(row), locale, t)}</span>
    ),
  };
  const tags: DeskColumn<MarketplaceResult> = {
    id: "tags",
    header: <Trans>Tags</Trans>,
    width: "minmax(0,1.4fr)",
    cell: (row) => (
      <span className="flex min-w-0 gap-1">
        {row.tags.slice(0, 2).map((tag) => (
          <TagBadge key={tag} tag={tag} size="sm" />
        ))}
        {row.tags.length > 2 ? (
          <Badge size="sm" variant="outline">
            +{row.tags.length - 2}
          </Badge>
        ) : null}
      </span>
    ),
  };
  const kind: DeskColumn<MarketplaceResult> = {
    id: "kind",
    header: <Trans>Type</Trans>,
    width: "8rem",
    sortValue: (row) => (row.kind === "voucher" ? row.voucherKind : row.kind),
    cell: (row) => <MarketKindBadge kind={row.kind === "voucher" ? row.voucherKind : row.kind} />,
  };
  if (scope === "pools") {
    return [
      name,
      {
        id: "vouchers",
        header: <Trans>Vouchers</Trans>,
        align: "end",
        width: "7rem",
        sortValue: (row) => (row.kind === "pool" ? row.voucherCount : 0),
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.kind === "pool" ? row.voucherCount : ""}
          </span>
        ),
      },
      place,
      distance,
      tags,
    ];
  }
  if (scope === "vouchers") {
    return [
      name,
      {
        id: "symbol",
        header: <Trans>Symbol</Trans>,
        width: "7rem",
        sortValue: (row) => (row.kind === "voucher" ? (row.symbol ?? "") : ""),
        cell: (row) => (
          <span dir="ltr" className="font-mono font-semibold">
            {row.kind === "voucher" ? row.symbol : ""}
          </span>
        ),
      },
      kind,
      place,
      distance,
      tags,
    ];
  }
  if (scope === "catalogs") {
    return [
      name,
      {
        id: "description",
        header: <Trans>Description</Trans>,
        width: "minmax(0,2fr)",
        cell: (row) => <span dir="auto">{row.description}</span>,
      },
      place,
      distance,
    ];
  }
  if (scope === "wants") return [name, place, distance, tags];
  return [name, kind, place, distance, tags];
}

/** An offer as an image tile: the voucher and symbol, the offering, its price and distance. */
function OfferTile({
  row,
  voucherAddress,
  distance,
}: {
  row: MarketplaceResult;
  voucherAddress: string;
  distance: string;
}) {
  const { i18n } = useLingui();
  const [failed, setFailed] = useState(false);
  const raw = formatOfferingPrice(row.priceInUnitOfAccount)?.value;
  const price = raw ? formatOfferingDisplayValue(raw, i18n.locales?.[0] ?? i18n.locale) : null;
  const currency = row.voucherUoa?.trim() || row.voucherSymbol || "";
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress }}
      search={{ from: "market" }}
      data-desktop-row=""
      className="flex min-w-0 flex-col border border-border bg-card hover:border-foreground/25"
    >
      <span
        className="relative block aspect-[4/3] overflow-hidden"
        style={{ background: marketSeedGradient(voucherAddress) }}
      >
        {row.imageUrl && !failed ? (
          <ProgressiveImage
            src={row.imageUrl}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
      </span>
      <span className="grid min-w-0 gap-0.5 p-3">
        <span className="truncate text-xs text-muted-foreground">
          <span dir="auto">{row.voucherName}</span>
          {row.voucherSymbol ? (
            <>
              {" · "}
              <span dir="ltr" className="font-mono">
                {row.voucherSymbol}
              </span>
            </>
          ) : null}
        </span>
        <span dir="auto" className="truncate text-sm font-semibold">
          {row.name}
        </span>
        {price ? (
          <span dir="ltr" className="truncate text-start font-mono text-xs font-semibold">
            {price} {currency}
            {row.unit ? ` / ${row.unit}` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            <Trans>Price on request</Trans>
          </span>
        )}
        <span className="min-h-4 truncate text-xs text-muted-foreground">{distance}</span>
      </span>
    </Link>
  );
}

function distanceLabel(
  meters: number | null,
  locale: string,
  t: ReturnType<typeof useLingui>["t"],
) {
  if (meters === null) return "";
  const display = formatDistance(meters);
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: display.fractionDigits,
    maximumFractionDigits: display.fractionDigits,
  }).format(display.value);
  return display.unit === "m" ? t`${value} m` : t`${value} km`;
}
