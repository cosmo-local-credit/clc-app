import type { Offering } from "@clc/api/features/offerings/client";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { formatOfferingPrice, formatOfferingQuantity } from "@clc/core/features/market/logic";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { MarketEmptyMessage } from "#/components/market-empty-message";
import {
  resolveOfferingDisplayPrice,
  useOfferingFrequencyLabel,
} from "#/components/offerings/offering-display";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { useStorageOwner } from "#/features/auth/hooks/use-storage-owner";
import { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { MARKET_FILTER_PREFERENCES_NAME } from "#/features/home/hooks/use-market-filter";
import { useOutputVoucherBrowse } from "#/features/home/hooks/use-output-voucher-browse";
import { useMarketFilterNotice } from "#/features/home/ui/market-filter-ui";
import { CATALOG_FILTER_PREFERENCE_NAMES } from "#/lib/navigation/catalog-filter-preference-storage";
import type { MarketListScope } from "#/lib/navigation/marketplace-search";
import { usePersistedCatalogFilter } from "#/lib/navigation/use-persisted-catalog-filter";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { useWantSheetSelection } from "#/lib/navigation/use-want-sheet-selection";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";
import { cn } from "#/lib/utils";
import { DeskSplit } from "#/desktop/ui/inspector";
import { DeskCanvas } from "#/desktop/ui/page";
import { MarketAvatar, MarketKindBadge, marketSeedGradient } from "#/desktop/market/market-bits";
import {
  MarketListFooter,
  MarketListSkeleton,
  OFFER_GRID,
} from "#/desktop/market/market-list-states";
import { useClearMarketNarrowing, useClearOutputVoucher } from "#/desktop/market/market-narrowing";
import {
  MarketCreditNotice,
  MarketFilterNotice,
  MarketOutputNotice,
} from "#/desktop/market/market-notices";
import { MarketDeskToolbar } from "#/desktop/market/market-toolbar";
import { useRememberMarketView } from "#/desktop/market/market-view";
import { MarketPlacePanel } from "#/desktop/market/place-panel";
import { type MarketListPhase, useMarketList } from "#/desktop/market/use-market-list";

export function MarketListDesk({
  scope,
  creditableSearch,
  outputVoucherSearch,
  locationOwner = GUEST_STORAGE_OWNER,
}: {
  scope: MarketListScope;
  creditableSearch?: boolean | string | readonly (boolean | string)[];
  /** The link's requested output voucher; it narrows the Pools list to pools that can pay it out. */
  outputVoucherSearch?: string | readonly string[];
  locationOwner?: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  useRememberMarketView("list");
  const distanceOrigin = useDiscoveryDistanceOrigin(locationOwner);
  const credit = useCreditableBrowse(creditableSearch);
  const output = useOutputVoucherBrowse(outputVoucherSearch, credit);
  // Offers and Pools remember their own filters, as the phone's Offers and
  // Pools pages do; the other lists share the market's.
  const filter = usePersistedCatalogFilter(
    scope === "offers"
      ? CATALOG_FILTER_PREFERENCE_NAMES.offers
      : scope === "pools"
        ? CATALOG_FILTER_PREFERENCE_NAMES.pools
        : MARKET_FILTER_PREFERENCES_NAME,
    useStorageOwner(),
    {
      ...(scope === "pools" ? { voucherRelationships: false } : {}),
      externalFilterActive: creditableSearch !== undefined || outputVoucherSearch !== undefined,
    },
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const list = useMarketList({ scope, filter, credit, output });
  const clearNarrowing = useClearMarketNarrowing();
  const clearOutput = useClearOutputVoucher();
  // Clear filters means every narrowing the list has: search, tags, Credit and the requested output.
  const clearAll = () => {
    filter.clear();
    clearNarrowing();
  };
  const notice = useMarketFilterNotice(
    { ...filter, clear: clearAll },
    list.phase === "failed" || list.refreshFailed ? list.error : null,
    list.retry,
    list.fetching,
    t`Couldn't load marketplace results.`,
  );
  const voucher = useVoucherSheetSelection();
  const want = useWantSheetSelection();
  const open = voucher.voucher !== null || want.want !== null;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { hasMore, failed: nextFailed, loading: nextLoading, load } = list.next;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      !hasMore ||
      nextFailed ||
      nextLoading ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) load();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, nextFailed, nextLoading, load]);

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
    if (!distanceOrigin) return null;
    return (
      row.distanceMeters ?? haversineMeters(distanceOrigin, { lat: row.geoLat, lng: row.geoLng })
    );
  };

  // Search, tags, Credit or a requested output narrow what the list can show.
  const narrowed = filter.isFiltered || credit.enabled || output.active;
  const creditEmpty = credit.enabled && credit.poolRefs?.length === 0;
  const checking =
    (output.state === "loading" && !credit.blocksResults) ||
    (credit.enabled && credit.verification.status === "loading" && !output.blocksResults);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DeskSplit
        dimmed={open}
        label={t`Marketplace details`}
        onDismiss={voucher.voucher !== null ? voucher.close : want.close}
        main={
          <DeskCanvas width="full">
            <h1 className="sr-only">
              <Trans>Market</Trans>
            </h1>
            <MarketDeskToolbar
              layout="page"
              scope={scope}
              filter={filter}
              facets={list.facets}
              filtersOpen={filtersOpen}
              onFiltersOpenChange={setFiltersOpen}
              credit={credit}
              onCredit={changeCredit}
              output={output}
              onClearOutput={clearOutput}
              count={narrowed && list.phase === "ready" ? list.count : undefined}
              refreshing={list.refreshing}
            />
            {list.sortedToMap && !distanceOrigin ? (
              <p className="text-xs text-muted-foreground">
                <Trans>Sorted nearest to the map view</Trans>
              </p>
            ) : null}
            <div className="grid gap-2 empty:hidden">
              <MarketCreditNotice credit={credit} onClear={clearCredit} />
              <MarketOutputNotice
                output={output}
                credit={credit}
                onClear={clearOutput}
                onClearAll={clearAll}
                showEmpty={false}
              />
              {notice ? <MarketFilterNotice notice={notice} /> : null}
            </div>
            <div>
              <ListBody
                scope={scope}
                phase={list.phase}
                waiting={checking}
                rows={list.rows}
                offerings={list.offerings}
                distanceOrigin={distanceOrigin}
                retained={list.retained}
                narrowed={narrowed}
                creditEmpty={creditEmpty}
                creditChecked={credit.enabled}
                outputActive={output.active}
                outputEmpty={output.isEmpty}
                filterActive={filter.isFiltered}
                onClear={clearAll}
                distanceOf={distanceOf}
                receiveOutput={credit.auth.isAuthenticated ? output.address : null}
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
              {list.phase === "ready" && list.count > 0 ? (
                <MarketListFooter
                  next={list.next}
                  ended={!list.retained && !list.refreshing && !list.refreshFailed}
                />
              ) : null}
            </div>
          </DeskCanvas>
        }
        side={
          open ? (
            <aside className="flex min-h-0 w-[400px] shrink-0 flex-col border-border border-s bg-card @min-[72rem]:w-[430px] @min-[100rem]:w-[460px]">
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
  phase,
  waiting,
  rows,
  offerings,
  distanceOrigin,
  retained,
  narrowed,
  creditEmpty,
  creditChecked,
  outputActive,
  outputEmpty,
  filterActive,
  onClear,
  distanceOf,
  receiveOutput,
  selectedKey,
  onOpenVoucher,
  onOpenWant,
  sheetOpen,
}: {
  scope: MarketListScope;
  phase: MarketListPhase;
  /** A check that gates the request is running, so rows are still to come. */
  waiting: boolean;
  rows: MarketplaceResult[];
  offerings: Offering[];
  distanceOrigin: { lat: number; lng: number } | null;
  /** The rows are the previous search's, kept until the next arrives. */
  retained: boolean;
  narrowed: boolean;
  creditEmpty: boolean;
  creditChecked: boolean;
  outputActive: boolean;
  outputEmpty: boolean;
  filterActive: boolean;
  /** Clears search, tags, Credit and the requested output. */
  onClear: () => void;
  distanceOf: (row: MarketplaceResult) => number | null;
  /** The voucher a pool's row should open the swap with, for a signed-in member who asked for it. */
  receiveOutput: `0x${string}` | null;
  selectedKey: string | null;
  onOpenVoucher: (address: `0x${string}`) => void;
  onOpenWant: (id: string) => void;
  sheetOpen: boolean;
}) {
  const { t } = useLingui();
  if (phase === "failed") return null;
  if (phase === "loading" || waiting) {
    return <MarketListSkeleton scope={scope} label={t`Loading marketplace…`} />;
  }
  if (phase === "blocked") {
    if (!creditEmpty && !outputEmpty) return null;
    return (
      <EmptyPanel onClear={onClear}>
        {outputEmpty ? (
          creditChecked ? (
            <Trans>No creditable pools have this voucher available.</Trans>
          ) : (
            <Trans>No pools have this voucher available.</Trans>
          )
        ) : (
          <Trans>No marketplace results are available through your Credit pools.</Trans>
        )}
      </EmptyPanel>
    );
  }
  if ((scope === "offers" ? offerings.length : rows.length) === 0) {
    return (
      <EmptyPanel onClear={narrowed ? onClear : undefined}>
        {creditChecked && outputActive && filterActive ? (
          <Trans>No creditable pools with this voucher match these filters.</Trans>
        ) : outputActive && filterActive ? (
          <Trans>No pools with this voucher match these filters.</Trans>
        ) : narrowed ? (
          <Trans>No marketplace results found.</Trans>
        ) : (
          <MarketEmptyMessage />
        )}
      </EmptyPanel>
    );
  }
  if (scope === "offers") {
    return (
      <div
        className={retained ? `${OFFER_GRID} opacity-60 transition-opacity` : OFFER_GRID}
        aria-busy={retained}
      >
        {offerings.map((offering) => (
          <OfferTile key={offering.id} offering={offering} distanceOrigin={distanceOrigin} />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3",
        retained && "opacity-60 transition-opacity",
      )}
      aria-busy={retained}
    >
      {rows.map((row) => (
        <MarketResultTile
          key={selectionKey(row)}
          row={row}
          distance={distanceOf(row)}
          selected={selectionKey(row) === selectedKey}
          receiveOutput={receiveOutput}
          sheetOpen={sheetOpen}
          onOpenVoucher={onOpenVoucher}
          onOpenWant={onOpenWant}
        />
      ))}
    </div>
  );
}

function MarketResultTile({
  row,
  distance,
  selected,
  receiveOutput,
  sheetOpen,
  onOpenVoucher,
  onOpenWant,
}: {
  row: MarketplaceResult;
  distance: number | null;
  selected: boolean;
  receiveOutput: `0x${string}` | null;
  sheetOpen: boolean;
  onOpenVoucher: (address: `0x${string}`) => void;
  onOpenWant: (id: string) => void;
}) {
  const { t, i18n } = useLingui();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = row.imageUrl && failedImage !== row.imageUrl ? row.imageUrl : null;
  const kind = row.kind === "voucher" ? row.voucherKind : row.kind;
  const meta = [
    row.kind === "voucher" && row.symbol ? row.symbol : null,
    row.kind === "pool" ? t`${row.voucherCount} vouchers` : null,
    row.kind === "catalog" && row.description ? row.description : null,
    row.locationName,
    distance === null ? null : distanceLabel(distance, i18n.locale, t),
  ].filter((part): part is string => Boolean(part));
  const content = (
    <>
      <span
        className="relative block aspect-[4/3] overflow-hidden"
        style={{ background: marketSeedGradient(row.address ?? row.id) }}
      >
        {image ? (
          <ProgressiveImage
            src={image}
            alt=""
            loading="lazy"
            onError={() => setFailedImage(image)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <MarketAvatar name={row.name} seed={row.address ?? row.id} kind={kind} />
          </span>
        )}
      </span>
      <span className="grid min-w-0 gap-1 p-3">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span dir="auto" className="min-w-0 truncate text-sm font-semibold">
            {row.name}
          </span>
          <MarketKindBadge kind={kind} />
        </span>
        <span className="min-h-4 truncate text-xs text-muted-foreground">{meta.join(" · ")}</span>
        {row.tags.length > 0 ? (
          <span className="flex min-w-0 gap-1 overflow-hidden">
            {row.tags.slice(0, 2).map((tag) => (
              <TagBadge key={tag} tag={tag} size="sm" />
            ))}
            {row.tags.length > 2 ? (
              <Badge size="sm" variant="outline">
                +{row.tags.length - 2}
              </Badge>
            ) : null}
          </span>
        ) : null}
      </span>
    </>
  );
  const className = cn(
    "flex min-w-0 flex-col border border-border bg-card text-start hover:border-foreground/25",
    selected && "border-primary",
  );
  if (row.kind === "pool" && row.address) {
    return receiveOutput ? (
      <Link
        to="/pools/$poolAddress/swap"
        params={{ poolAddress: row.address }}
        search={{ receive: receiveOutput }}
        className={className}
      >
        {content}
      </Link>
    ) : (
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
  if (row.kind === "post") {
    return (
      <Link to="/posts/$reportId" params={{ reportId: row.id }} className={className}>
        {content}
      </Link>
    );
  }
  if (row.kind === "offering" && row.voucherAddress) {
    return (
      <Link
        to="/vouchers/$voucherAddress"
        params={{ voucherAddress: row.voucherAddress }}
        search={{ from: "market" }}
        className={className}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onFocus={(event) => {
        if (!sheetOpen || !event.currentTarget.matches(":focus-visible")) return;
        openRow(row, onOpenVoucher, onOpenWant);
      }}
      onClick={() => openRow(row, onOpenVoucher, onOpenWant)}
    >
      {content}
    </button>
  );
}

/** No matches: the narrowing that caused it, and the one action that undoes all of it. */
function EmptyPanel({ children, onClear }: { children: ReactNode; onClear?: () => void }) {
  return (
    <div className="space-y-3 border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{children}</p>
      {onClear ? (
        <Button variant="outline" onClick={onClear}>
          <Trans>Clear filters</Trans>
        </Button>
      ) : null}
    </div>
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

/**
 * An offer as an image tile: the voucher and symbol, the offering, its price,
 * then quantity · frequency · distance, as the phone's offering tile reads.
 */
function OfferTile({
  offering,
  distanceOrigin,
}: {
  offering: Offering;
  distanceOrigin: { lat: number; lng: number } | null;
}) {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const candidateImage = offering.imageUrl ?? offering.voucherImageUrl ?? null;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = candidateImage && failedImage !== candidateImage ? candidateImage : null;
  const price = resolveOfferingDisplayPrice(offering, null, locale);
  const hasFixedPrice = formatOfferingPrice(offering.pricePerUnit) !== null;
  const quantity = formatOfferingQuantity(
    offering.quantity,
    offering.unitLabel,
    offering.sourceId === null,
  );
  const quantityNumber = quantity ? Number(quantity.value) : 0;
  const quantityValue =
    quantity && quantity.value.length > 6 && Number.isFinite(quantityNumber)
      ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(
          quantityNumber,
        )
      : quantity?.value;
  const frequency = useOfferingFrequencyLabel(offering.frequency);
  const meters = distanceOrigin
    ? (offering.distanceMeters ??
      (typeof offering.effectiveGeoLat === "number" && typeof offering.effectiveGeoLng === "number"
        ? haversineMeters(distanceOrigin, {
            lat: offering.effectiveGeoLat,
            lng: offering.effectiveGeoLng,
          })
        : null))
    : null;
  const meta = [
    quantityValue ? `${quantityValue}${quantity?.unit ? ` ${quantity.unit}` : ""}` : null,
    frequency,
    meters === null ? null : distanceLabel(meters, locale, t),
  ].filter((part): part is string => Boolean(part));
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: offering.voucherAddress }}
      search={{ from: "market" }}
      data-desktop-row=""
      className="flex min-w-0 flex-col border border-border bg-card hover:border-foreground/25"
    >
      <span
        className="relative block aspect-[4/3] overflow-hidden"
        style={{ background: marketSeedGradient(offering.voucherAddress) }}
      >
        {image ? (
          <ProgressiveImage
            src={image}
            alt=""
            loading="lazy"
            onError={() => setFailedImage(image)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
      </span>
      <span className="grid min-w-0 gap-0.5 p-3">
        <span className="truncate text-xs text-muted-foreground">
          <span dir="auto">{offering.voucherName}</span>
          {offering.voucherSymbol ? (
            <>
              {offering.voucherName ? " · " : null}
              <span dir="ltr" className="font-mono">
                {offering.voucherSymbol}
              </span>
            </>
          ) : null}
        </span>
        <span dir="auto" className="truncate text-sm font-semibold">
          {offering.name}
        </span>
        {price ? (
          <span dir="ltr" className="truncate text-start font-mono text-xs font-semibold">
            {price.value} {price.unit}
            {offering.unitLabel ? ` / ${offering.unitLabel}` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {hasFixedPrice ? <Trans>Price unavailable</Trans> : <Trans>Price on request</Trans>}
          </span>
        )}
        <span className="min-h-4 truncate text-xs text-muted-foreground">{meta.join(" · ")}</span>
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
