import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { wantDetailQueryOptions } from "@clc/api/features/wants/queries";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { RiArrowLeftLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { VoucherSheetFull } from "#/components/vouchers/voucher-sheet-full.lazy";
import {
  ShareVoucherButton,
  useVoucherBalanceSummary,
  VoucherIdentitySummary,
} from "#/components/vouchers/voucher-summary";
import { WantDetail } from "#/components/wants/want-detail";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { wantsClient } from "#/lib/api/wants";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { useWantSheetSelection } from "#/lib/navigation/use-want-sheet-selection";

type Coordinates = { lat: number; lng: number };

/** The voucher or want sheet, as a column instead of a bottom sheet. */
export function MarketPlacePanel({ realFix }: { realFix: Coordinates | null }) {
  const voucher = useVoucherSheetSelection();
  const want = useWantSheetSelection();
  if (voucher.voucher) {
    return <VoucherPlace address={voucher.voucher} realFix={realFix} onClose={voucher.close} />;
  }
  if (want.want) return <WantPlace id={want.want} realFix={realFix} onClose={want.close} />;
  return null;
}

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
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-14 items-center px-4">
        <Button type="button" variant="ghost" size="icon" aria-label={t`Close`} onClick={onClose}>
          <RiArrowLeftLine aria-hidden="true" />
        </Button>
      </div>
      {unavailable ? (
        <div className="space-y-3 px-4" role="alert">
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
        <div className="min-h-0 flex-1 overflow-auto">
          <VoucherIdentitySummary
            className="px-4 pb-4"
            address={detail?.address ?? address}
            name={name}
            symbol={symbol}
            iconUrl={detail?.iconUrl}
            avatarSize={40}
            balance={balance}
            place={distanceLabel ?? detail?.locationName}
            tags={detail?.tags}
            ownerAddress={detail?.ownerAddress}
            locationName={detail?.locationName}
            lat={lat}
            lng={lng}
            phone={detail?.phone}
            website={detail?.website}
            catalogResourceId={detail?.id}
            catalogAddress={detail?.address}
            title={
              <div className="flex min-w-0 items-baseline gap-2">
                <Link
                  to="/vouchers/$voucherAddress"
                  params={{ voucherAddress: detail?.address ?? address }}
                  search={{ from: "market" }}
                  dir="auto"
                  className="min-w-0 truncate font-heading text-base font-semibold"
                >
                  {name}
                </Link>
                <span
                  dir="ltr"
                  className="shrink-0 font-medium font-mono text-muted-foreground text-xs"
                >
                  {symbol}
                </span>
              </div>
            }
            headerActions={
              <ShareVoucherButton name={name} address={address} destination="detail" />
            }
          />
          <Suspense fallback={<Skeleton className="mx-4 h-40" />}>
            <VoucherSections address={address} detail={detail} detailQuery={detailQuery} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function VoucherSections({
  address,
  detail,
  detailQuery,
}: {
  address: `0x${string}`;
  detail: MarketVoucherDetail | undefined;
  detailQuery: ReturnType<typeof useMarketVoucherDetail>;
}) {
  return (
    <VoucherSheetFull
      address={address}
      detail={detail}
      privateInfo={
        detailQuery.privateInfo
          ? { ...detailQuery.privateInfo, retry: () => void detailQuery.privateInfo?.refetch() }
          : undefined
      }
    />
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
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-14 items-center px-4">
        <Button type="button" variant="ghost" size="icon" aria-label={t`Close`} onClick={onClose}>
          <RiArrowLeftLine aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
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
