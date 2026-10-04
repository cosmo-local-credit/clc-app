import type { MarketVoucherDetail, MarketVoucherKind } from "@clc/api/features/market/client";
import { poolFilteredPageQueryOptions } from "@clc/api/features/pools/queries";
import { EMPTY_CATALOG_FILTER } from "@clc/core/features/catalog/logic";
import { formatVoucherRate } from "@clc/core/features/market/logic";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, useState, type ReactNode } from "react";
import {
  RiCloseLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiHandCoinLine,
  RiNavigationLine,
  RiPhoneLine,
  RiShareLine,
} from "react-icons/ri";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
  MapSheet,
  MapSheetDescription,
  MapSheetPeek,
  MapSheetTitle,
  type MapSheetSnap,
} from "#/components/ui/map-sheet";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Skeleton } from "#/components/ui/skeleton";
import { PoolLogo, VoucherAvatar } from "#/components/wallet";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useVoucherOfferingsInfinite } from "#/features/home/hooks/use-voucher-offerings";
import { poolsClient } from "#/lib/api/pools";
import { CHAIN_ID } from "#/lib/chain";
import { openDefaultMaps } from "#/lib/default-maps";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import type { VoucherSheetTab } from "#/lib/navigation/voucher-sheet-search";
import { cn } from "#/lib/utils";
import { useMarketDistanceLabel, useMarketKindLabel } from "./voucher-labels";
import type { VoucherPageOrigin } from "./voucher-sheet-full";
import { VoucherSheetFull } from "./voucher-sheet-full.lazy";

export type { VoucherPageOrigin } from "./voucher-sheet-full";

type Coordinates = { lat: number; lng: number };

/** What the screen that opened the card already knows, to draw it before detail. */
export type VoucherPlaceholder = {
  name: string;
  symbol: string;
  iconUrl?: string | null;
  kind?: MarketVoucherKind;
  locationName?: string | null;
  lat?: number | null;
  lng?: number | null;
  chainId?: number | null;
};

const POOL_CARD_LIMIT = 10;
const OFFERING_STRIP_LIMIT = 8;

/** A pill draws at 36 px; the inset widens its tap target to 44. */
const PILL =
  "relative h-9 shrink-0 gap-1.5 px-3 before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']";

/** The sheet's snap point, back at the peek each time a card opens. */
export function useVoucherSheetSnap(isOpen: boolean) {
  const [snap, setSnap] = useState<MapSheetSnap>("peek");
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    // Forward and deep links included.
    if (isOpen) setSnap("peek");
  }
  return [snap, setSnap] as const;
}

/**
 * The card a voucher opens, wherever it is tapped: the market, the wallet, a
 * pool or a post. It shows the essentials at the peek, adds the offerings, the
 * description and the pools that hold the voucher at half, and reads as the
 * voucher's page at full. Only its own button leaves for that page.
 *
 * The selection lives in the opening screen's URL (`useVoucherSheetSelection`).
 * Everything below the peek mounts the first time its tier is reached and
 * stays mounted after a collapse, so its queries run once per card.
 */
export function VoucherSheet({
  placeholder = null,
  origin,
  realFix = null,
  snap: controlledSnap,
  onSnapChange,
  onCoveredHeightChange,
  floating,
}: {
  placeholder?: VoucherPlaceholder | null;
  /** Where the voucher's page should send Back once opened from the card. */
  origin?: VoucherPageOrigin;
  realFix?: Coordinates | null;
  /** Controlled by a screen that moves the sheet itself; the map collapses it on a pan. */
  snap?: MapSheetSnap;
  onSnapChange?: (snap: MapSheetSnap) => void;
  onCoveredHeightChange?: (height: number, snap: MapSheetSnap) => void;
  floating?: ReactNode;
}) {
  const { t } = useLingui();
  const selection = useVoucherSheetSelection();
  const isOpen = selection.voucher !== null;
  // The card keeps the voucher it last showed while it animates closed.
  const [address, setAddress] = useState(selection.voucher);
  if (selection.voucher && selection.voucher !== address) setAddress(selection.voucher);
  const [ownSnap, setOwnSnap] = useVoucherSheetSnap(isOpen);
  const snap = controlledSnap ?? ownSnap;
  const setSnap = onSnapChange ?? setOwnSnap;

  const detailQuery = useMarketVoucherDetail(address ?? undefined);
  const detail = detailQuery.data;
  if (!address) return null;

  const name = detail?.name ?? placeholder?.name ?? "";
  // A shared link can name a voucher nothing on screen holds, or one that no
  // longer exists: there is then nothing to draw the card from.
  const unavailable = !detail && !placeholder && detailQuery.isError;

  return (
    <MapSheet
      open={isOpen}
      snap={snap}
      onSnapChange={setSnap}
      onClose={selection.close}
      onCoveredHeightChange={onCoveredHeightChange}
      floating={floating}
    >
      {unavailable ? (
        <MapSheetPeek className="px-4 pb-4">
          <div className="flex items-start gap-3">
            <MapSheetTitle className="min-w-0 flex-1 pt-2.5 text-muted-foreground text-sm">
              <Trans>Couldn't load this voucher.</Trans>
            </MapSheetTitle>
            <CloseButton label={t`Close`} onClick={selection.close} />
          </div>
          <Button
            variant="outline"
            size="sm"
            className={cn(PILL, "mt-3 bg-card")}
            onClick={() => void detailQuery.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </MapSheetPeek>
      ) : (
        <VoucherCard
          key={address}
          address={address}
          placeholder={placeholder}
          detail={detail}
          name={name}
          realFix={realFix}
          snap={snap}
          onSnapChange={setSnap}
          voucherTab={selection.voucherTab}
          origin={origin}
          onClose={selection.close}
        />
      )}
    </MapSheet>
  );
}

/** Borderless, so the close reads as part of the header rather than a second box. */
function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="-me-2 size-11 shrink-0 border-0 text-muted-foreground"
      aria-label={label}
      onClick={onClick}
    >
      <RiCloseLine className="size-5" aria-hidden="true" />
    </Button>
  );
}

function VoucherCard({
  address,
  placeholder,
  detail,
  name,
  realFix,
  snap,
  onSnapChange,
  voucherTab,
  origin,
  onClose,
}: {
  address: `0x${string}`;
  placeholder: VoucherPlaceholder | null;
  detail: MarketVoucherDetail | undefined;
  name: string;
  realFix: Coordinates | null;
  snap: MapSheetSnap;
  onSnapChange: (snap: MapSheetSnap) => void;
  voucherTab: VoucherSheetTab;
  origin: VoucherPageOrigin | undefined;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [reachedHalf, setReachedHalf] = useState(false);
  const [reachedFull, setReachedFull] = useState(false);
  if (snap !== "peek" && !reachedHalf) setReachedHalf(true);
  if (snap === "full" && !reachedFull) setReachedFull(true);

  const symbol = detail?.symbol ?? placeholder?.symbol ?? "";
  const kindLabel = useMarketKindLabel(detail?.kind ?? placeholder?.kind ?? "voucher");
  const lat = detail?.lat ?? placeholder?.lat ?? null;
  const lng = detail?.lng ?? placeholder?.lng ?? null;
  const coordinates = lat !== null && lng !== null ? { lat, lng } : null;
  const locationName = detail?.locationName ?? placeholder?.locationName ?? null;
  const distanceLabel = useMarketDistanceLabel(realFix, coordinates);
  const place = distanceLabel ?? locationName;
  const rate = formatVoucherRate(detail?.voucherValue ?? null, detail?.voucherUoa ?? null);
  const phone = detail?.phone ?? null;
  const website = detail?.website && isHttpUrl(detail.website) ? detail.website : null;

  return (
    <>
      <MapSheetPeek className="px-4 pb-4">
        <div className="flex items-start gap-3">
          {/* A pointer shortcut, as on the place sheet. The handle above is the
              control that names the action for everyone else. */}
          <div
            className="flex min-w-0 flex-1 items-center gap-3"
            onClick={snap === "peek" ? () => onSnapChange("half") : undefined}
          >
            <VoucherAvatar
              address={address}
              symbol={symbol}
              iconUrl={detail?.iconUrl ?? placeholder?.iconUrl ?? null}
              size={40}
            />
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <MapSheetTitle
                dir="auto"
                className="min-w-0 truncate font-heading font-semibold text-[1.375rem] leading-tight tracking-[-0.02em]"
              >
                {name}
              </MapSheetTitle>
              <span
                dir="ltr"
                className="shrink-0 font-medium font-mono text-muted-foreground text-xs"
              >
                {symbol}
              </span>
            </div>
          </div>
          <CloseButton label={t`Close`} onClick={onClose} />
        </div>
        <MapSheetDescription className="mt-1 flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
          <span className="inline-flex shrink-0 border border-border bg-background px-1.5 py-0.5 font-medium text-[0.6875rem]">
            {kindLabel}
          </span>
          {place ? (
            <span dir="auto" className="truncate">
              {place}
            </span>
          ) : null}
        </MapSheetDescription>
        {rate ? (
          <p className="mt-1.5 truncate font-mono text-[0.6875rem] text-muted-foreground">
            {/* An equation of symbols and figures reads left to right everywhere. */}
            <span dir="ltr">
              <Trans>
                1 {symbol} = {rate.value} {rate.unit}
              </Trans>
            </span>
          </p>
        ) : null}

        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Button asChild size="sm" className={PILL}>
            <Link to="/pools" search={{ out_voucher: address.toLowerCase() }}>
              <RiHandCoinLine aria-hidden="true" />
              <Trans>Get</Trans>
            </Link>
          </Button>
          {coordinates || locationName ? (
            <Button
              variant="outline"
              size="sm"
              className={cn(PILL, "bg-card")}
              onClick={() => openDefaultMaps({ label: locationName ?? name, lat, lng })}
            >
              <RiNavigationLine aria-hidden="true" />
              <Trans>Directions</Trans>
            </Button>
          ) : null}
          {phone ? (
            <Button asChild variant="outline" size="sm" className={cn(PILL, "bg-card")}>
              <a href={`tel:${phone}`}>
                <RiPhoneLine aria-hidden="true" />
                <Trans>Call</Trans>
              </a>
            </Button>
          ) : null}
          {website ? (
            <Button asChild variant="outline" size="sm" className={cn(PILL, "bg-card")}>
              <a href={website} target="_blank" rel="noreferrer noopener">
                <RiGlobalLine aria-hidden="true" />
                <Trans>Website</Trans>
              </a>
            </Button>
          ) : null}
          <ShareVoucherButton name={name} address={address} />
        </div>
      </MapSheetPeek>

      {reachedHalf ? (
        <HalfTier
          address={address}
          detail={detail}
          expanded={snap === "full"}
          chainId={detail?.chainId ?? placeholder?.chainId ?? CHAIN_ID}
          onOpenOfferings={() => onSnapChange("full")}
        />
      ) : null}

      {reachedFull ? (
        <Suspense fallback={<Skeleton className="mx-4 mt-6 h-40 rounded-none" />}>
          <VoucherSheetFull
            address={address}
            detail={detail}
            activeTab={voucherTab}
            origin={origin}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function HalfTier({
  address,
  detail,
  expanded,
  chainId,
  onOpenOfferings,
}: {
  address: `0x${string}`;
  detail: MarketVoucherDetail | undefined;
  /** At full the description reads in full here, and Overview leaves it out. */
  expanded: boolean;
  chainId: number;
  onOpenOfferings: () => void;
}) {
  const { t } = useLingui();
  // `kind === "voucher"` already says there is nothing on offer.
  const offeringsQuery = useVoucherOfferingsInfinite(
    detail && detail.kind !== "voucher" ? address : undefined,
  );
  const offerings = (offeringsQuery.data?.pages[0]?.offerings ?? []).filter(
    (offering) => offering.imageUrl,
  );
  const poolsQuery = useQuery({
    ...poolFilteredPageQueryOptions(poolsClient, {
      perPage: POOL_CARD_LIMIT,
      filter: { ...EMPTY_CATALOG_FILTER, vouchers: [{ chainId, address }] },
    }),
    // Each card is its own query; another voucher's pools must never stand in.
    placeholderData: undefined,
  });
  const pools = poolsQuery.data?.pools ?? [];
  const description = detail?.description ?? null;
  const bannerUrl = detail?.bannerUrl ?? null;

  return (
    <div className="space-y-4 pb-6">
      {offerings.length > 0 ? (
        <ul
          aria-label={t`Offerings`}
          className="flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {offerings.slice(0, OFFERING_STRIP_LIMIT).map((offering) => (
            <li key={offering.id} className="shrink-0 snap-start">
              <Link
                to="."
                search={(previous) => ({ ...previous, voucherTab: undefined })}
                replace
                state
                resetScroll={false}
                onClick={onOpenOfferings}
                aria-label={offering.name}
                className="relative block size-24 overflow-hidden border border-border bg-card"
              >
                <ProgressiveImage
                  src={offering.imageUrl ?? undefined}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                  skeletonClassName="absolute inset-0 size-full rounded-none"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : bannerUrl ? (
        <div className="relative mx-4 h-32 overflow-hidden border border-border bg-card">
          <ProgressiveImage
            src={bannerUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
            skeletonClassName="absolute inset-0 size-full rounded-none"
          />
        </div>
      ) : null}

      {description ? (
        <p dir="auto" className={cn("px-4 text-sm leading-relaxed", !expanded && "line-clamp-3")}>
          {description}
        </p>
      ) : null}

      {pools.length > 0 ? (
        <section aria-labelledby="market-voucher-pools">
          <div className="flex items-center justify-between gap-3 px-4">
            <h3
              id="market-voucher-pools"
              className="font-heading font-semibold text-[1.125rem] tracking-[-0.015em]"
            >
              <Trans>Pools with this voucher</Trans>
            </h3>
            <Link
              to="/pools"
              search={{ out_voucher: address.toLowerCase() }}
              className="relative shrink-0 font-semibold text-primary text-xs before:absolute before:-inset-3 before:content-['']"
            >
              <Trans>See all</Trans>
            </Link>
          </div>
          <ul className="mt-2 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {pools.map((pool) => (
              // Tinted in the brand colour: on the white sheet a white tile
              // reads as more of the same, and these are where to act.
              <li
                key={pool.address}
                className="flex w-56 shrink-0 snap-start flex-col border border-primary/25 bg-primary/5 p-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <PoolLogo
                    imageUrl={pool.imageUrl}
                    name={pool.name}
                    seed={pool.address}
                    size={36}
                  />
                  <div className="min-w-0">
                    <p dir="auto" className="truncate font-bold text-sm tracking-tight">
                      {pool.name}
                    </p>
                    <p className="font-semibold text-[0.6875rem] text-primary">
                      {pool.voucherCount === 1 ? (
                        <Trans>1 voucher</Trans>
                      ) : (
                        <Trans>{pool.voucherCount} vouchers</Trans>
                      )}
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-3 h-9 bg-card">
                  <Link
                    to="/pools/$poolAddress/swap"
                    params={{ poolAddress: pool.address }}
                    search={{ receive: address }}
                  >
                    <Trans>Swap</Trans>
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Shares the card's own link. Prefers the native share sheet and offers a
 * fresh copy tap if it fails: sharing consumes the tap's user activation, and
 * WebKit will not write to the clipboard without a new one.
 */
function ShareVoucherButton({ name, address }: { name: string; address: string }) {
  const { t } = useLingui();
  const [copyOnly, setCopyOnly] = useState(false);
  const label = copyOnly ? t`Copy link` : t`Share`;
  const Icon = copyOnly ? RiFileCopyLine : RiShareLine;

  function link() {
    return `${window.location.origin}/?voucher=${address}`;
  }

  function copy() {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy link`);
      return;
    }
    void navigator.clipboard
      .writeText(link())
      .then(() => toast.success(t`Link copied`))
      .catch(() => toast.error(t`Couldn't copy link`));
  }

  async function share() {
    if (!navigator.share) {
      copy();
      return;
    }
    try {
      await navigator.share({ title: name, url: link() });
    } catch (error) {
      // AbortError = the viewer dismissed the sheet; not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCopyOnly(true);
    }
  }

  const onClick = () => {
    if (copyOnly) copy();
    else void share();
  };

  return (
    <Button variant="outline" size="sm" className={cn(PILL, "bg-card")} onClick={onClick}>
      <Icon aria-hidden="true" />
      {label}
    </Button>
  );
}
