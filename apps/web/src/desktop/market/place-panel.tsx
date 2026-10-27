import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { wantDetailQueryOptions } from "@clc/api/features/wants/queries";
import { isHttpUrl } from "@clc/core/lib/contact";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense, useState, type ReactNode } from "react";
import {
  RiArrowLeftSLine,
  RiCoinLine,
  RiGlobalLine,
  RiHandCoinLine,
  RiNavigationLine,
  RiPhoneLine,
  RiSendPlane2Line,
} from "react-icons/ri";
import { isAddress, zeroAddress } from "viem";

import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { ReviewStars } from "#/components/reviews/review-editor";
import { Button } from "#/components/ui/button";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { Skeleton } from "#/components/ui/skeleton";
import { TagBadge } from "#/components/ui/tag-badge";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { VoucherSheetFull } from "#/components/vouchers/voucher-sheet-full.lazy";
import {
  ShareVoucherButton,
  useVoucherBalanceSummary,
  type VoucherBalanceSummary,
} from "#/components/vouchers/voucher-summary";
import { WantDetail } from "#/components/wants/want-detail";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useVoucherReviewSummary } from "#/features/reviews/hooks/use-voucher-reviews";
import { wantsClient } from "#/lib/api/wants";
import { openDefaultMaps } from "#/lib/default-maps";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { useWantSheetSelection } from "#/lib/navigation/use-want-sheet-selection";
import { cn } from "#/lib/utils";
import { marketSeedGradient } from "#/desktop/market/market-bits";
import { DeskTab, DeskTabs } from "#/desktop/ui/tabs";

type Coordinates = { lat: number; lng: number };

/** The voucher or want sheet, as a column instead of a bottom sheet. */
export function MarketPlacePanel({ realFix }: { realFix: Coordinates | null }) {
  const voucher = useVoucherSheetSelection();
  const want = useWantSheetSelection();
  if (voucher.voucher) {
    return (
      <VoucherPlace
        key={voucher.voucher}
        address={voucher.voucher}
        realFix={realFix}
        onClose={voucher.close}
      />
    );
  }
  if (want.want) return <WantPlace id={want.want} realFix={realFix} onClose={want.close} />;
  return null;
}

type Section = "offerings" | "reviews" | "posts" | "info" | "activity";

const SECTIONS: { id: Section; label: ReactNode }[] = [
  { id: "offerings", label: <Trans>Offerings</Trans> },
  { id: "reviews", label: <Trans>Reviews</Trans> },
  { id: "posts", label: <Trans>Posts</Trans> },
  { id: "info", label: <Trans>Info</Trans> },
  { id: "activity", label: <Trans>Activity</Trans> },
];

/**
 * The shared voucher sections render all five in this order. A tab shows one
 * and keeps the others mounted, as the stacked sheet does.
 */
const SECTION_VISIBLE: Record<Section, string> = {
  offerings: "[&>div>section:not(:nth-child(1))]:hidden",
  reviews: "[&>div>section:not(:nth-child(2))]:hidden",
  posts: "[&>div>section:not(:nth-child(3))]:hidden",
  info: "[&>div>section:not(:nth-child(4))]:hidden",
  activity: "[&>div>section:not(:nth-child(5))]:hidden",
};

function VoucherPlace({
  address,
  realFix,
  onClose,
}: {
  address: `0x${string}`;
  realFix: Coordinates | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [section, setSection] = useState<Section>("offerings");
  const detailQuery = useMarketVoucherDetail(address);
  const detail = detailQuery.data;
  const name = detail?.name ?? "";
  const symbol = detail?.symbol ?? "";
  const lat = detail?.lat ?? null;
  const lng = detail?.lng ?? null;
  const coordinates = lat !== null && lng !== null ? { lat, lng } : null;
  const distanceLabel = useMarketDistanceLabel(realFix, coordinates);
  const balance = useVoucherBalanceSummary({
    address: detail?.address ?? address,
    symbol,
    decimals: detail?.decimals,
    voucherValue: detail?.voucherValue,
    voucherUoa: detail?.voucherUoa,
  });
  const unavailable = !detail && detailQuery.isError;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-card">
      <div
        className="relative h-[140px] overflow-hidden"
        style={{ background: marketSeedGradient(address) }}
      >
        {detail?.bannerUrl ? (
          <ProgressiveImage
            src={detail.bannerUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t`Back`}
          onClick={onClose}
          className="absolute start-3 top-3"
        >
          <RiArrowLeftSLine aria-hidden="true" />
        </Button>
      </div>
      {unavailable ? (
        <div className="space-y-3 p-4" role="alert">
          <p className="text-sm text-muted-foreground">
            <Trans>Couldn't load this voucher.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={detailQuery.isFetching}
            onClick={() => void detailQuery.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 p-4 pb-0">
            <div className="grid min-w-0 gap-1.5">
              <div className="flex min-w-0 items-start gap-2">
                <h2 className="flex min-w-0 flex-1 items-baseline gap-2 pt-1">
                  <Link
                    to="/vouchers/$voucherAddress"
                    params={{ voucherAddress: detail?.address ?? address }}
                    search={{ from: "market" }}
                    dir="auto"
                    className="min-w-0 truncate font-heading text-xl font-semibold tracking-tight hover:underline"
                  >
                    {name}
                  </Link>
                  <span dir="ltr" className="shrink-0 font-mono text-xs text-muted-foreground">
                    {symbol}
                  </span>
                </h2>
                <ShareVoucherButton
                  name={name}
                  address={address}
                  destination="detail"
                  className="-mt-1.5"
                />
              </div>
              <BalanceLine balance={balance} />
              <ReviewLine address={address} place={distanceLabel ?? detail?.locationName} />
              {detail?.tags && detail.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.slice(0, 3).map((tag) => (
                    <TagBadge key={tag} tag={tag} size="sm" />
                  ))}
                </div>
              ) : null}
            </div>
            <PlaceActions
              address={detail?.address ?? address}
              name={name}
              detail={detail}
              hasPositiveBalance={balance.hasPositiveBalance}
            />
            {detail ? (
              <div className="flex">
                <AddToCatalogButton
                  kind="voucher"
                  resourceId={detail.id}
                  address={detail.address}
                />
              </div>
            ) : null}
            <DeskTabs label={t`Voucher`} tight className="sticky top-0 z-10 bg-card">
              {SECTIONS.map((entry) => (
                <DeskTab key={entry.id} active={entry.id === section}>
                  <button type="button" onClick={() => setSection(entry.id)}>
                    {entry.label}
                  </button>
                </DeskTab>
              ))}
            </DeskTabs>
          </div>
          <div className={cn("pt-2", SECTION_VISIBLE[section])}>
            <Suspense fallback={<Skeleton className="mx-4 mt-2 h-40" />}>
              <VoucherSheetFull
                address={address}
                detail={detail}
                privateInfo={
                  detailQuery.privateInfo
                    ? {
                        ...detailQuery.privateInfo,
                        retry: () => void detailQuery.privateInfo?.refetch(),
                      }
                    : undefined
                }
              />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}

function BalanceLine({ balance }: { balance: VoucherBalanceSummary }) {
  if (balance.status === "hidden") return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <Trans>Your Balance</Trans>
      {balance.status === "loading" ? (
        <Trans>Loading…</Trans>
      ) : balance.status === "unavailable" ? (
        <>
          <span className="text-destructive">
            <Trans>Unavailable</Trans>
          </span>
          <Button
            type="button"
            variant="ghost"
            tap
            pending={balance.retrying}
            onClick={balance.retry}
          >
            <Trans>Retry</Trans>
          </Button>
        </>
      ) : (
        <span dir="ltr" className="font-mono font-semibold text-foreground">
          {balance.amount} {balance.symbol}
          {balance.unitValue ? (
            <span className="text-muted-foreground">
              {" "}
              ({balance.unitValue.value} {balance.unitValue.unit})
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

function ReviewLine({ address, place }: { address: string; place?: string | null }) {
  const { i18n } = useLingui();
  const review = useVoucherReviewSummary(address);
  const count = review.summary?.total ?? 0;
  const average = count > 0 ? (review.summary?.average ?? 0) : 0;
  const locale = i18n.locales?.[0] ?? i18n.locale;
  return (
    <p className="flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
      <span className="font-mono font-semibold text-foreground">
        {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(average)}
      </span>
      <ReviewStars stars={average} />
      <span className="font-mono">({new Intl.NumberFormat(locale).format(count)})</span>
      {place ? (
        <>
          <span aria-hidden="true">·</span>
          <span dir="auto" className="min-w-0 truncate">
            {place}
          </span>
        </>
      ) : null}
    </p>
  );
}

const CELL =
  "flex min-w-0 flex-col items-center gap-1 border-border border-e px-1 py-2.5 text-2xs font-medium last:border-e-0 hover:bg-muted [&_svg]:size-4";

/**
 * The sheet's action row as equal cells: the same links and handlers, and the
 * same rules for which actions a viewer gets.
 */
function PlaceActions({
  address,
  name,
  detail,
  hasPositiveBalance,
}: {
  address: string;
  name: string;
  detail: MarketVoucherDetail | undefined;
  hasPositiveBalance: boolean;
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const ownerAddress = detail?.ownerAddress;
  const lat = detail?.lat;
  const lng = detail?.lng;
  const locationName = detail?.locationName;
  const phone = detail?.phone;
  const website = detail?.website && isHttpUrl(detail.website) ? detail.website : null;
  const owner =
    ownerAddress &&
    isAddress(ownerAddress, { strict: false }) &&
    ownerAddress.toLowerCase() !== zeroAddress
      ? ownerAddress
      : null;
  const coordinates = typeof lat === "number" && typeof lng === "number";
  const cells: ReactNode[] = [
    <Link
      key="get"
      to="/market"
      search={{ scope: "pools", out_voucher: address.toLowerCase() }}
      className={CELL}
    >
      <RiHandCoinLine aria-hidden="true" />
      <Trans>Get</Trans>
    </Link>,
  ];
  if (hasPositiveBalance) {
    cells.push(
      <Link key="send" to="/wallet/send" search={{ token: address }} className={CELL}>
        <RiSendPlane2Line aria-hidden="true" />
        <Trans>Send</Trans>
      </Link>,
    );
  }
  if (hasPositiveBalance && owner) {
    cells.push(
      <Link
        key="redeem"
        to="/wallet/send/amount"
        search={{ token: address, recipient: owner }}
        className={CELL}
      >
        <RiCoinLine aria-hidden="true" />
        <Trans>Redeem</Trans>
      </Link>,
    );
  }
  if (auth.isAuthenticated && (coordinates || locationName)) {
    cells.push(
      <button
        key="directions"
        type="button"
        className={CELL}
        onClick={() => openDefaultMaps({ label: locationName ?? name, lat, lng })}
      >
        <RiNavigationLine aria-hidden="true" />
        <Trans>Directions</Trans>
      </button>,
    );
  }
  if (auth.isAuthenticated && phone) {
    cells.push(
      <a key="call" href={`tel:${phone}`} className={CELL}>
        <RiPhoneLine aria-hidden="true" />
        <Trans>Call</Trans>
      </a>,
    );
  }
  if (auth.isAuthenticated && website) {
    cells.push(
      <a key="website" href={website} target="_blank" rel="noreferrer noopener" className={CELL}>
        <RiGlobalLine aria-hidden="true" />
        <Trans>Website</Trans>
      </a>,
    );
  }
  return (
    <div
      role="group"
      aria-label={t`Voucher actions`}
      className="grid border border-border bg-card"
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells}
    </div>
  );
}

function WantPlace({
  id,
  realFix,
  onClose,
}: {
  id: string;
  realFix: Coordinates | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const query = useQuery({
    ...wantDetailQueryOptions(wantsClient, id),
    retry: false,
  });
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-card">
      <div className="flex h-13 items-center border-border border-b px-3">
        <Button type="button" variant="outline" size="icon" aria-label={t`Back`} onClick={onClose}>
          <RiArrowLeftSLine aria-hidden="true" />
        </Button>
      </div>
      <div className="p-4 pb-6">
        {query.isError ? (
          <div className="space-y-3" role="alert">
            <p className="text-sm text-muted-foreground">
              <Trans>Couldn't load this Want.</Trans>
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
        ) : query.data ? (
          <WantDetail want={query.data} distanceOrigin={realFix} showRelated />
        ) : (
          <Skeleton className="h-40" />
        )}
      </div>
    </div>
  );
}
