import type { MarketVoucherDetail, MarketVoucherKind } from "@clc/api/features/market/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense, useState, type ReactNode } from "react";
import { RiCloseLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  MapSheet,
  MapSheetPeek,
  MapSheetTitle,
  type MapSheetSnap,
} from "#/components/ui/map-sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { useMarketDistanceLabel } from "./voucher-labels";
import { VoucherSheetFull } from "./voucher-sheet-full.lazy";
import {
  ShareVoucherButton,
  useVoucherBalanceSummary,
  VoucherIdentitySummary,
} from "./voucher-summary";

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
 * The card a map voucher opens. It shows the essentials at the peek, then the
 * same continuous voucher experience as the canonical page from half onward.
 *
 * The selection lives in the map URL (`useVoucherSheetSelection`).
 * Everything below the peek mounts the first time its tier is reached and
 * stays mounted after a collapse, so its queries run once per card.
 */
export function VoucherSheet({
  placeholder = null,
  modal = true,
  realFix = null,
  snap: controlledSnap,
  onSnapChange,
  onCoveredHeightChange,
  floating,
  bottomNavigationVisible = false,
}: {
  placeholder?: VoucherPlaceholder | null;
  /** False over the map, which stays live under the card. */
  modal?: boolean;
  realFix?: Coordinates | null;
  /** Controlled by a screen that moves the sheet itself; the map collapses it on a pan. */
  snap?: MapSheetSnap;
  onSnapChange?: (snap: MapSheetSnap) => void;
  onCoveredHeightChange?: (height: number, snap: MapSheetSnap) => void;
  floating?: ReactNode;
  /** The non-modal map sheet sits beneath the authenticated app navigation. */
  bottomNavigationVisible?: boolean;
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
      minimumPeekRatio={!modal ? 1 / 3 : undefined}
      underBottomNavigation={!modal && bottomNavigationVisible}
    >
      {unavailable ? (
        <MapSheetPeek className="px-4 pb-4">
          <div className="flex items-center gap-3">
            <MapSheetTitle className="min-w-0 flex-1 text-muted-foreground text-sm">
              <Trans>Couldn't load this voucher.</Trans>
            </MapSheetTitle>
            <CloseButton label={t`Close`} onClick={selection.close} />
          </div>
          <Button variant="outline" tap className="mt-3" onClick={() => void detailQuery.refetch()}>
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
      className="-me-3 border-0 text-muted-foreground"
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
  onClose,
}: {
  address: `0x${string}`;
  placeholder: VoucherPlaceholder | null;
  detail: MarketVoucherDetail | undefined;
  name: string;
  realFix: Coordinates | null;
  snap: MapSheetSnap;
  onSnapChange: (snap: MapSheetSnap) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [reachedHalf, setReachedHalf] = useState(false);
  if (snap !== "peek" && !reachedHalf) setReachedHalf(true);

  const symbol = detail?.symbol ?? placeholder?.symbol ?? "";
  const lat = detail?.lat ?? placeholder?.lat ?? null;
  const lng = detail?.lng ?? placeholder?.lng ?? null;
  const coordinates = lat !== null && lng !== null ? { lat, lng } : null;
  const locationName = detail?.locationName ?? placeholder?.locationName ?? null;
  const distanceLabel = useMarketDistanceLabel(realFix, coordinates);
  const place = distanceLabel ?? locationName;
  const voucherPageAddress = detail?.address ?? address;
  const balance = useVoucherBalanceSummary({
    address: voucherPageAddress,
    symbol,
    decimals: detail?.decimals,
    voucherValue: detail?.voucherValue,
    voucherUoa: detail?.voucherUoa,
  });

  return (
    <>
      <MapSheetPeek className="px-4 pb-4">
        <VoucherIdentitySummary
          address={voucherPageAddress}
          name={name}
          symbol={symbol}
          iconUrl={detail?.iconUrl ?? placeholder?.iconUrl}
          avatarSize={40}
          balance={balance}
          place={place}
          tags={detail?.tags}
          ownerAddress={detail?.ownerAddress}
          locationName={locationName}
          lat={lat}
          lng={lng}
          phone={detail?.phone}
          website={detail?.website}
          catalogResourceId={detail?.id}
          catalogAddress={detail?.address}
          onIdentityClick={
            snap === "peek"
              ? () => onSnapChange("half")
              : snap === "half"
                ? () => onSnapChange("full")
                : undefined
          }
          onIdentityDoubleClick={snap === "full" ? undefined : () => onSnapChange("full")}
          title={
            <div className="flex min-w-0 items-baseline gap-2">
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
          }
          headerActions={
            <>
              <ShareVoucherButton name={name} address={address} destination="detail" />
              <CloseButton label={t`Close`} onClick={onClose} />
            </>
          }
        />
      </MapSheetPeek>

      {reachedHalf ? (
        <Suspense fallback={<Skeleton className="mx-4 mt-6 h-40 rounded-none" />}>
          <VoucherSheetFull address={address} detail={detail} onRetired={onClose} />
        </Suspense>
      ) : null}
    </>
  );
}
