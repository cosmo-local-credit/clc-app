import type { MarketVoucherDetail, MarketVoucherKind } from "@clc/api/features/market/client";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Suspense, useState, type ReactNode } from "react";
import {
  RiCloseLine,
  RiCoinLine,
  RiFileCopyLine,
  RiGlobalLine,
  RiHandCoinLine,
  RiNavigationLine,
  RiPhoneLine,
  RiSendPlane2Line,
  RiShareLine,
} from "react-icons/ri";
import { toast } from "sonner";
import { isAddress, zeroAddress } from "viem";

import { ReviewStars } from "#/components/reviews/review-editor";
import { Button } from "#/components/ui/button";
import {
  MapSheet,
  MapSheetDescription,
  MapSheetPeek,
  MapSheetTitle,
  type MapSheetSnap,
} from "#/components/ui/map-sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { VoucherAvatar } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useVoucherReviewSummary } from "#/features/reviews/hooks/use-voucher-reviews";
import { useAllAccountTokens } from "#/features/wallet/hooks/use-account-balances";
import { openDefaultMaps } from "#/lib/default-maps";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { cn } from "#/lib/utils";
import { useMarketDistanceLabel } from "./voucher-labels";
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
 * pool or a post. It shows the essentials at the peek, then one continuous
 * offerings-and-reviews view from half onward. Only its own button leaves for
 * the complete voucher page.
 *
 * The selection lives in the opening screen's URL (`useVoucherSheetSelection`).
 * Everything below the peek mounts the first time its tier is reached and
 * stays mounted after a collapse, so its queries run once per card.
 */
export function VoucherSheet({
  placeholder = null,
  origin,
  modal = true,
  realFix = null,
  snap: controlledSnap,
  onSnapChange,
  onCoveredHeightChange,
  floating,
}: {
  placeholder?: VoucherPlaceholder | null;
  /** Where the voucher's page should send Back once opened from the card. */
  origin?: VoucherPageOrigin;
  /** False over the map, which stays live under the card. */
  modal?: boolean;
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
      modal={modal}
      snap={snap}
      onSnapChange={setSnap}
      onClose={selection.close}
      onCoveredHeightChange={onCoveredHeightChange}
      floating={floating}
    >
      {unavailable ? (
        <MapSheetPeek className="px-4 pb-4">
          <div className="flex items-center gap-3">
            <MapSheetTitle className="min-w-0 flex-1 text-muted-foreground text-sm">
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
          origin={origin}
          onClose={selection.close}
        />
      )}
    </MapSheet>
  );
}

/**
 * Borderless, so the close reads as part of the header rather than a second
 * box. The 44 px target overhangs the content inset so the glyph itself lines
 * up with the content's edge.
 */
function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="-me-3 size-11 shrink-0 border-0 text-muted-foreground"
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
  origin: VoucherPageOrigin | undefined;
  onClose: () => void;
}) {
  const { i18n, t } = useLingui();
  const [reachedHalf, setReachedHalf] = useState(false);
  if (snap !== "peek" && !reachedHalf) setReachedHalf(true);

  const symbol = detail?.symbol ?? placeholder?.symbol ?? "";
  const lat = detail?.lat ?? placeholder?.lat ?? null;
  const lng = detail?.lng ?? placeholder?.lng ?? null;
  const coordinates = lat !== null && lng !== null ? { lat, lng } : null;
  const locationName = detail?.locationName ?? placeholder?.locationName ?? null;
  const distanceLabel = useMarketDistanceLabel(realFix, coordinates);
  const place = distanceLabel ?? locationName;
  const phone = detail?.phone ?? null;
  const website = detail?.website && isHttpUrl(detail.website) ? detail.website : null;
  const reviewQuery = useVoucherReviewSummary(address);
  const reviewSummary = reviewQuery.summary;
  const reviewCount = reviewSummary?.total ?? 0;
  const reviewAverage = reviewCount > 0 ? (reviewSummary?.average ?? 0) : 0;
  const numberLocale = i18n.locales?.[0] ?? i18n.locale;
  const formattedAverage = new Intl.NumberFormat(numberLocale, {
    maximumFractionDigits: 1,
  }).format(reviewAverage);
  const formattedReviewCount = new Intl.NumberFormat(numberLocale).format(reviewCount);
  const auth = useAuthStatus();
  const holdings = useAllAccountTokens(
    auth.isAuthenticated ? (auth.session?.address ?? undefined) : undefined,
  );
  const holding = holdings.tokens.find(
    (token) => token.tokenAddress.toLowerCase() === address.toLowerCase(),
  );
  const hasPositiveBalance =
    auth.isAuthenticated &&
    !!holding &&
    /^\d+$/.test(holding.balance) &&
    BigInt(holding.balance) > 0n;
  const voucherPageAddress = detail?.address ?? address;
  const verifiedOwnerAddress =
    detail?.ownerAddress &&
    isAddress(detail.ownerAddress, { strict: false }) &&
    detail.ownerAddress.toLowerCase() !== zeroAddress
      ? detail.ownerAddress
      : null;

  return (
    <>
      <MapSheetPeek className="px-4 pb-4">
        <div className="flex items-center gap-3">
          {/* A pointer shortcut, as on the place sheet. The handle above is the
              control that names the action for everyone else. */}
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 select-none",
              snap !== "full" && "cursor-pointer",
            )}
            onClick={
              snap === "peek"
                ? () => onSnapChange("half")
                : snap === "half"
                  ? () => onSnapChange("full")
                  : undefined
            }
            onDoubleClick={snap === "full" ? undefined : () => onSnapChange("full")}
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
          <div className="-me-3 flex shrink-0 items-center">
            <ShareVoucherButton name={name} address={address} />
            <CloseButton label={t`Close`} onClick={onClose} />
          </div>
        </div>
        <MapSheetDescription className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground text-xs">
          <span className="font-mono tabular-nums">{formattedAverage}</span>
          <ReviewStars stars={reviewAverage} />
          <span className="font-mono tabular-nums">({formattedReviewCount})</span>
          {place ? (
            <>
              <span aria-hidden="true">·</span>
              <span dir="auto" className="min-w-0 truncate">
                {place}
              </span>
            </>
          ) : null}
        </MapSheetDescription>
        {detail?.tags && detail.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {detail.tags.slice(0, 3).map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2 py-1">
          <Button asChild size="sm" className={PILL}>
            <Link to="/market" search={{ scope: "pools", out_voucher: address.toLowerCase() }}>
              <RiHandCoinLine aria-hidden="true" />
              <Trans>Get</Trans>
            </Link>
          </Button>
          {hasPositiveBalance ? (
            <Button asChild variant="outline" size="sm" className={cn(PILL, "bg-card")}>
              <Link to="/wallet/send" search={{ token: voucherPageAddress }}>
                <RiSendPlane2Line aria-hidden="true" />
                <Trans>Send</Trans>
              </Link>
            </Button>
          ) : null}
          {hasPositiveBalance && verifiedOwnerAddress ? (
            <Button asChild variant="outline" size="sm" className={cn(PILL, "bg-card")}>
              <Link
                to="/wallet/send/amount"
                search={{ token: voucherPageAddress, recipient: verifiedOwnerAddress }}
              >
                <RiCoinLine aria-hidden="true" />
                <Trans>Redeem</Trans>
              </Link>
            </Button>
          ) : null}
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
        </div>
      </MapSheetPeek>

      {reachedHalf ? (
        <Suspense fallback={<Skeleton className="mx-4 mt-6 h-40 rounded-none" />}>
          <VoucherSheetFull address={address} detail={detail} origin={origin} />
        </Suspense>
      ) : null}
    </>
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
    <Button
      variant="ghost"
      size="icon-lg"
      className="size-11 shrink-0 border-0 text-muted-foreground"
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="size-5" aria-hidden="true" />
    </Button>
  );
}
