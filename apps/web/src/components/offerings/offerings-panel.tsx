import {
  formatOfferingDisplayPrice,
  formatOfferingDisplayValue,
  formatOfferingPrice,
  formatOfferingQuantity,
} from "@clc/core/features/market/logic";
import { formatDistance, haversineMeters } from "@clc/core/lib/geo/distance";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { TagBadge } from "#/components/ui/tag-badge";
import { hueFromSeed } from "#/components/wallet/wallet-data";
import type { Offering, OfferingFrequency } from "@clc/api/features/offerings/client";
import { cn } from "#/lib/utils";

/**
 * The shape both offering screens' infinite queries satisfy. Declared
 * structurally rather than importing `UseInfiniteQueryResult` so this component
 * stays a view: it reads a query, it does not own or create one.
 */
type OfferingsQueryLike = {
  data?: { pages: { offerings: Offering[] }[] };
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  refetch: () => unknown;
};

/**
 * One offering catalog, rendered identically wherever it is reached from.
 *
 * A voucher page and a pool page show the same tiles opening the same sheet, so
 * the grid lives here rather than in either feature — sibling features cannot
 * import each other's `ui/`, and two copies of a buying surface would drift.
 * Callers supply their own query and empty-state copy, which is all that
 * legitimately differs between them.
 */
/**
 * What a voucher owner can do to a row, when the caller is a screen that knows
 * who is looking.
 *
 * Passed in rather than derived here, so this stays a read component. The pool
 * offerings view renders the same tiles for vouchers it does not own, and pulling
 * a voucher-owner hook in here would make ownership a concern of every screen
 * that lists an offering.
 */
export type OfferingManagement = {
  onEdit: (offering: Offering) => void;
  onDelete: (offering: Offering) => void;
  /** The row currently being unlisted, if any. */
  deletingID?: string | null;
};

export type OfferingVoucherRate = {
  value: string | null;
  unit: string | null;
};

export function OfferingsPanel({
  query,
  emptyState,
  showVoucher = false,
  showVoucherName = false,
  fallbackSymbol,
  suppressed = false,
  management,
  resolveVoucherRate,
  maxItems,
  manualPageSize,
  autoLoadMore = true,
  openVoucherPageAction = "navigate",
  directNavigation = false,
  showLocation = false,
  distanceOrigin,
  ...props
}: ComponentProps<"div"> & {
  query: OfferingsQueryLike;
  /** Feature-specific copy: "nothing for this voucher" vs "nothing in this pool". */
  emptyState: ReactNode;
  /** A pool's offerings come from many vouchers, so each tile names its own. */
  showVoucher?: boolean;
  /** Global discovery names the parent voucher as well as its symbol. */
  showVoucherName?: boolean;
  /** Used only when a row arrives with no voucher symbol of its own. */
  fallbackSymbol?: string;
  /** The caller already knows the result is empty and issued no request. */
  suppressed?: boolean;
  /** Present only for a voucher's own owner. Absent means read-only. */
  management?: OfferingManagement;
  /** Resolves the voucher conversion attached to this row's parent voucher. */
  resolveVoucherRate?: (offering: Offering) => OfferingVoucherRate | null;
  /** A compact preview may intentionally show only the first few rows. */
  maxItems?: number;
  /** A continuous detail page reveals this many rows per explicit request. */
  manualPageSize?: number;
  /** Infinite catalog screens load on intersection; bounded previews do not. */
  autoLoadMore?: boolean;
  /** The voucher page itself only needs to dismiss the informational rollup. */
  openVoucherPageAction?: "navigate" | "close";
  /** A discovery result opens its parent voucher without an intermediate rollup. */
  directNavigation?: boolean;
  showLocation?: boolean;
  distanceOrigin?: { lat: number; lng: number } | null;
}) {
  const { t } = useLingui();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [manualLimit, setManualLimit] = useState(manualPageSize ?? 0);
  const manualIncrement = manualPageSize ?? 0;
  const offerings = query.data?.pages.flatMap((page) => page.offerings) ?? [];
  const itemLimit = maxItems ?? (manualPageSize ? manualLimit : undefined);
  const visibleOfferings = itemLimit === undefined ? offerings : offerings.slice(0, itemLimit);
  const hasManualNext = !!manualPageSize && (manualLimit < offerings.length || query.hasNextPage);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !target ||
      suppressed ||
      !!manualPageSize ||
      !autoLoadMore ||
      !query.hasNextPage ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    autoLoadMore,
    manualPageSize,
    suppressed,
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchingNextPage,
  ]);

  return (
    <div {...props}>
      {suppressed ? <OfferingsEmptyState>{emptyState}</OfferingsEmptyState> : null}

      {!suppressed && query.isPending ? (
        <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
          <Trans>Loading offerings…</Trans>
        </div>
      ) : null}

      {!suppressed && query.isError ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-muted-foreground text-sm">
            <Trans>Couldn't load offerings.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}

      {!suppressed && query.isSuccess && offerings.length === 0 ? (
        <OfferingsEmptyState>{emptyState}</OfferingsEmptyState>
      ) : null}

      {/* auto-rows-fr so every row is the same height, not just every tile within
          a row: the grid reads as one matrix regardless of how many text lines
          each offering happens to have. */}
      {offerings.length > 0 ? (
        <div className="grid auto-rows-fr grid-cols-2 gap-2">
          {visibleOfferings.map((offering) => (
            <OfferingTile
              key={offering.id}
              offering={offering}
              voucherSymbol={offering.voucherSymbol ?? fallbackSymbol ?? "VOUCHER"}
              showVoucher={showVoucher}
              showVoucherName={showVoucherName}
              management={management}
              voucherRate={resolveVoucherRate?.(offering) ?? null}
              openVoucherPageAction={openVoucherPageAction}
              directNavigation={directNavigation}
              showLocation={showLocation}
              distanceOrigin={distanceOrigin}
            />
          ))}
        </div>
      ) : null}

      <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
      {autoLoadMore && !manualPageSize && query.isFetchingNextPage ? (
        <p className="py-3 text-center text-muted-foreground text-xs">
          <Trans>Loading more…</Trans>
        </p>
      ) : null}
      {hasManualNext ? (
        <Button
          variant="outline"
          tap
          className="mt-3 w-full"
          pending={query.isFetchingNextPage}
          onClick={() => {
            if (manualLimit >= offerings.length && query.hasNextPage) {
              void Promise.resolve(query.fetchNextPage()).then(() =>
                setManualLimit((current) => current + manualIncrement),
              );
              return;
            }
            setManualLimit((current) => current + manualIncrement);
          }}
        >
          {query.isFetchingNextPage ? t`Loading…` : t`Load more`}
        </Button>
      ) : null}
    </div>
  );
}

function OfferingsEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-sm font-semibold">
        <Trans>No offerings yet</Trans>
      </p>
      <p className="mt-1 text-muted-foreground text-sm">{children}</p>
    </div>
  );
}

function OfferingTile({
  offering,
  voucherSymbol,
  showVoucher,
  showVoucherName,
  management,
  voucherRate,
  openVoucherPageAction,
  directNavigation,
  showLocation,
  distanceOrigin,
}: {
  offering: Offering;
  voucherSymbol: string;
  showVoucher: boolean;
  showVoucherName: boolean;
  management?: OfferingManagement;
  voucherRate: OfferingVoucherRate | null;
  openVoucherPageAction: "navigate" | "close";
  directNavigation: boolean;
  showLocation: boolean;
  distanceOrigin?: { lat: number; lng: number } | null;
}) {
  const { i18n, t } = useLingui();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const candidateImageUrl = offering.imageUrl ?? offering.voucherImageUrl ?? null;
  const imageUrl =
    candidateImageUrl && failedImage !== candidateImageUrl ? candidateImageUrl : null;
  const price = resolveOfferingDisplayPrice(
    offering,
    voucherRate,
    i18n.locales?.[0] ?? i18n.locale,
  );
  const hasFixedPrice = formatOfferingPrice(offering.pricePerUnit) !== null;
  const quantity = formatOfferingQuantity(
    offering.quantity,
    offering.unitLabel,
    offering.sourceId === null,
  );
  const quantityNumber = quantity ? Number(quantity.value) : 0;
  const quantityValue =
    quantity && quantity.value.length > 6 && Number.isFinite(quantityNumber)
      ? new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(quantityNumber)
      : quantity?.value;
  const frequency = useOfferingFrequencyLabel(offering.frequency);
  const initials = offeringInitials(offering.name);
  const locationLabel = showLocation
    ? offeringDistanceLabel(offering, distanceOrigin, i18n.locales?.[0] ?? i18n.locale)
    : null;

  const tileContents = (
    <>
      <span
        data-slot="offering-media"
        className="relative block h-36 w-full shrink-0 overflow-hidden bg-muted"
      >
        <OfferingImage
          imageUrl={imageUrl}
          initials={initials}
          seed={offering.id}
          initialsClassName="text-3xl"
          onError={() => setFailedImage(imageUrl)}
        />
      </span>
      <span className="block min-h-[4.5rem] flex-1 p-2">
        {showVoucher ? (
          <span
            data-slot="offering-voucher"
            className="mb-0.5 block truncate font-mono text-2xs font-semibold text-info"
          >
            {showVoucherName && offering.voucherName
              ? `${offering.voucherName} · ${voucherSymbol}`
              : voucherSymbol}
          </span>
        ) : null}
        <span className="line-clamp-2 text-sm font-semibold leading-tight [overflow-wrap:anywhere]">
          {offering.name}
        </span>
        <span className="mt-1 block truncate text-xs font-semibold text-primary tabular-nums">
          {price ? (
            `${price.value} ${price.unit}${offering.unitLabel ? ` / ${offering.unitLabel}` : ""}`
          ) : hasFixedPrice ? (
            <Trans>Price unavailable</Trans>
          ) : (
            <Trans>Price on request</Trans>
          )}
        </span>
        {quantityValue || frequency ? (
          <span className="block truncate text-xs text-muted-foreground">
            {quantityValue}
            {quantityValue && quantity?.unit ? ` ${quantity.unit}` : null}
            {quantityValue && frequency ? <span aria-hidden="true"> · </span> : null}
            {frequency}
          </span>
        ) : null}
        {locationLabel ? (
          <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
            {locationLabel}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <div className="flex flex-col">
      {directNavigation ? (
        <Link
          to="/vouchers/$voucherAddress"
          params={{ voucherAddress: offering.voucherAddress }}
          search={{}}
          className="flex min-w-0 flex-col overflow-hidden border border-border bg-card text-start active:bg-muted"
          aria-label={t`Open voucher for ${offering.name}`}
        >
          {tileContents}
        </Link>
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-col overflow-hidden border border-border bg-card text-start active:bg-muted"
          aria-label={t`View offering details: ${offering.name}`}
          onClick={() => setDetailsOpen(true)}
        >
          {tileContents}
        </button>
      )}

      {/* Outside the tile's button, not inside it: nesting a button in a button is
          invalid, and a tap meant for Edit must not also open the buying sheet. */}
      {management ? (
        <span data-slot="offering-actions" className="flex border-x border-b border-border">
          <button
            type="button"
            className="h-9 flex-1 border-e border-border bg-card text-xs font-semibold"
            onClick={() => management.onEdit(offering)}
          >
            <Trans>Edit</Trans>
          </button>
          <button
            type="button"
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 bg-card text-xs font-semibold text-destructive"
            disabled={management.deletingID === offering.id}
            aria-busy={management.deletingID === offering.id || undefined}
            onClick={() => management.onDelete(offering)}
          >
            {management.deletingID === offering.id ? (
              <>
                <Spinner />
                <Trans>Removing…</Trans>
              </>
            ) : (
              <Trans>Remove</Trans>
            )}
          </button>
        </span>
      ) : null}

      {directNavigation ? null : (
        <OfferingDetailsSheet
          offering={offering}
          imageUrl={imageUrl}
          initials={initials}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onImageError={() => setFailedImage(imageUrl)}
          voucherRate={voucherRate}
          openVoucherPageAction={openVoucherPageAction}
        />
      )}
    </div>
  );
}

function offeringDistanceLabel(
  offering: Offering,
  origin: { lat: number; lng: number } | null | undefined,
  locale: string,
): string | null {
  const meters =
    offering.distanceMeters ??
    (origin &&
    typeof offering.effectiveGeoLat === "number" &&
    typeof offering.effectiveGeoLng === "number"
      ? haversineMeters(origin, {
          lat: offering.effectiveGeoLat,
          lng: offering.effectiveGeoLng,
        })
      : null);
  const location = offering.effectiveLocationName ?? null;
  if (meters === null) return location;
  const display = formatDistance(meters);
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: display.fractionDigits,
    maximumFractionDigits: display.fractionDigits,
  }).format(display.value);
  const distance = `${value} ${display.unit}`;
  return location ? `${location} · ${distance}` : distance;
}

/**
 * The browsing surface for one offering. Ordering is deliberately absent here:
 * a private order belongs to a confirmed owner-directed transfer, not to a
 * public marketplace preview.
 *
 * Dismissal is the backdrop, not a labelled button. Base UI closes a dialog on
 * an outside press by default (`disablePointerDismissal` is false), so the only
 * close control left is a screen-reader one — a modal dialog traps focus, and
 * touch screen readers cannot reach the backdrop to escape it.
 */
function OfferingDetailsSheet({
  offering,
  imageUrl,
  initials,
  open,
  onOpenChange,
  onImageError,
  voucherRate,
  openVoucherPageAction,
}: {
  offering: Offering;
  imageUrl: string | null;
  initials: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageError: () => void;
  voucherRate: OfferingVoucherRate | null;
  openVoucherPageAction: "navigate" | "close";
}) {
  const { i18n } = useLingui();
  const price = resolveOfferingDisplayPrice(
    offering,
    voucherRate,
    i18n.locales?.[0] ?? i18n.locale,
  );
  const hasFixedPrice = formatOfferingPrice(offering.pricePerUnit) !== null;
  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent>
          <SheetClose className="sr-only">
            <Trans>Close</Trans>
          </SheetClose>

          {/* A wide, shallow crop leaves room for long descriptions on a phone. */}
          <span
            data-slot="offering-media"
            className="relative mt-3 block h-40 w-full shrink-0 overflow-hidden bg-muted"
          >
            <OfferingImage
              imageUrl={imageUrl}
              initials={initials}
              seed={offering.id}
              initialsClassName="text-5xl"
              onError={onImageError}
            />
          </span>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <SheetHeader className="px-6 pt-4 pb-0">
              <SheetTitle className="[overflow-wrap:anywhere]">{offering.name}</SheetTitle>
              <p className="text-sm font-semibold text-primary tabular-nums">
                {price ? (
                  `${price.value} ${price.unit}${offering.unitLabel ? ` / ${offering.unitLabel}` : ""}`
                ) : hasFixedPrice ? (
                  <Trans>Price unavailable</Trans>
                ) : (
                  <Trans>Price on request</Trans>
                )}
              </p>
            </SheetHeader>

            {offering.description ? (
              <div className="mx-6 mt-3 border border-border bg-card p-3">
                <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
                  {offering.description}
                </p>
              </div>
            ) : null}

            {offering.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 px-6">
                {offering.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} />
                ))}
              </div>
            ) : null}
          </div>

          <SheetFooter className="px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {openVoucherPageAction === "close" ? (
              <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
                <Trans>Open voucher page</Trans>
              </Button>
            ) : (
              <Button asChild size="lg" className="w-full">
                <Link
                  to="/vouchers/$voucherAddress"
                  params={{ voucherAddress: offering.voucherAddress }}
                  search={{}}
                  onClick={() => onOpenChange(false)}
                >
                  <Trans>Open voucher page</Trans>
                </Link>
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function resolveOfferingDisplayPrice(
  offering: Offering,
  voucherRate: OfferingVoucherRate | null,
  locale: string,
): { value: string; unit: string } | null {
  if (!formatOfferingPrice(offering.pricePerUnit)) return null;

  const converted = voucherRate
    ? formatOfferingDisplayPrice(offering.pricePerUnit, voucherRate.value, voucherRate.unit, "")
    : offering.priceInUnitOfAccount && offering.voucherUoa
      ? {
          value: formatOfferingPrice(offering.priceInUnitOfAccount)?.value ?? "",
          unit: offering.voucherUoa.trim(),
        }
      : null;
  if (!converted?.value || !converted.unit) return null;

  const localized = formatOfferingDisplayValue(converted.value, locale);
  return localized ? { value: localized, unit: converted.unit } : null;
}

/**
 * An offering's photo, or a seeded monogram when it has none or the fetch
 * failed. 44% of the imported catalog has no image, so the fallback is a normal
 * state rather than an error surface.
 */
function OfferingImage({
  imageUrl,
  initials,
  seed,
  initialsClassName,
  onError,
}: {
  imageUrl: string | null;
  initials: string;
  seed: string;
  initialsClassName: string;
  onError: () => void;
}) {
  if (imageUrl) {
    return (
      <ProgressiveImage
        src={imageUrl}
        alt=""
        loading="lazy"
        className="size-full object-cover"
        onError={onError}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-full items-center justify-center font-heading font-bold text-white",
        initialsClassName,
      )}
      style={{ background: hueFromSeed(seed) }}
    >
      {initials}
    </span>
  );
}

/** Up to two initials from issuer-authored, sometimes non-Latin, free text. */
function offeringInitials(commodityName: string): string {
  return (
    commodityName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toLocaleUpperCase() || "OF"
  );
}

function useOfferingFrequencyLabel(frequency: OfferingFrequency | null): string | null {
  const { t } = useLingui();
  switch (frequency) {
    case "day":
      return t`Daily`;
    case "week":
      return t`Weekly`;
    case "month":
      return t`Monthly`;
    case "year":
      return t`Yearly`;
    case null:
      return null;
  }
}
