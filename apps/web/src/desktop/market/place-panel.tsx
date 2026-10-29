import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId, useState, type ReactNode } from "react";
import { RiArrowLeftSLine } from "react-icons/ri";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import { useVoucherBalanceSummary } from "#/components/vouchers/voucher-summary";
import { marketSeedGradient } from "#/desktop/market/market-bits";
import { DeskTab, DeskTabPanel, DeskTabs } from "#/desktop/ui/tabs";
import { WantPlaceDesk } from "#/desktop/wants/want-place-desk";
import { VoucherActionCells } from "#/desktop/vouchers/detail/voucher-actions";
import { VoucherActivityDesk } from "#/desktop/vouchers/detail/voucher-activity";
import { VoucherCatalogButton } from "#/desktop/vouchers/detail/voucher-catalog-button";
import { useCanEditVoucher, VoucherInfoDesk } from "#/desktop/vouchers/detail/voucher-info";
import { VoucherOfferingsDesk } from "#/desktop/vouchers/detail/voucher-offerings";
import { VoucherPostsDesk } from "#/desktop/vouchers/detail/voucher-posts";
import { VoucherReviewsDesk } from "#/desktop/vouchers/detail/voucher-reviews";
import {
  VoucherBalanceLine,
  VoucherRatingLine,
  VoucherShareButton,
} from "#/desktop/vouchers/detail/voucher-section-bits";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useVoucherSheetSelection } from "#/lib/navigation/use-voucher-sheet-selection";
import { useWantSheetSelection } from "#/lib/navigation/use-want-sheet-selection";

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
  if (want.want) {
    return <WantPlaceDesk id={want.want} distanceOrigin={realFix} onClose={want.close} />;
  }
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
  const tabsId = useId();
  const panelId = `${tabsId}-panel`;
  const tabId = (id: Section) => `${tabsId}-tab-${id}`;
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
  const voucherAddress = detail?.address ?? address;
  const { address: walletAddress } = useConnection();
  const { canEdit } = useCanEditVoucher(voucherAddress, detail);
  const reportVoucher: VoucherRef | undefined = detail?.chainId
    ? { chainId: detail.chainId, address: voucherAddress as VoucherRef["address"] }
    : undefined;
  const privateInfo = detailQuery.privateInfo
    ? { ...detailQuery.privateInfo, retry: () => void detailQuery.privateInfo?.refetch() }
    : undefined;

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
        <div className="grid justify-items-start gap-3 p-4" role="alert">
          <p className="text-sm text-muted-foreground">
            <Trans>Couldn't load this voucher.</Trans>
          </p>
          <Button
            variant="outline"
            pending={detailQuery.isFetching}
            onClick={() => void detailQuery.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3.5 p-4 pb-6">
          <div className="grid min-w-0 gap-1.5">
            <div className="flex min-w-0 items-start gap-2">
              {/* The 16px section/inspector title role, as every other panel heading. */}
              <SectionHeading
                as="h2"
                variant="section"
                className="flex min-w-0 flex-1 items-baseline gap-2 pt-1.5"
              >
                <Link
                  to="/vouchers/$voucherAddress"
                  params={{ voucherAddress }}
                  search={{ from: "market" }}
                  dir="auto"
                  className="min-w-0 truncate hover:underline"
                >
                  {name}
                </Link>
                <span
                  dir="ltr"
                  className="shrink-0 font-mono text-xs font-normal text-muted-foreground"
                >
                  {symbol}
                </span>
              </SectionHeading>
              <VoucherShareButton name={name} address={address} />
            </div>
            {balance.status === "hidden" ? null : (
              <p className="flex min-w-0 text-xs text-muted-foreground">
                <VoucherBalanceLine balance={balance} />
              </p>
            )}
            <p className="flex min-w-0 text-xs text-muted-foreground">
              <VoucherRatingLine address={address} place={distanceLabel ?? detail?.locationName} />
            </p>
            {detail?.tags && detail.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.slice(0, 3).map((tag) => (
                  <TagBadge key={tag} tag={tag} size="sm" />
                ))}
              </div>
            ) : null}
          </div>
          <VoucherActionCells
            address={voucherAddress}
            name={name}
            ownerAddress={detail?.ownerAddress}
            hasPositiveBalance={balance.hasPositiveBalance}
            locationName={detail?.locationName}
            lat={lat}
            lng={lng}
            phone={detail?.phone}
            website={detail?.website}
            size="panel"
          />
          {detail ? (
            <div className="flex">
              <VoucherCatalogButton resourceId={detail.id} address={detail.address} />
            </div>
          ) : null}
          {/* Local content tabs: the tablist pattern, not route links. */}
          <DeskTabs label={t`Voucher`} kind="tabs" tight className="sticky top-0 z-10 bg-card">
            {SECTIONS.map((entry) => (
              <DeskTab
                key={entry.id}
                active={entry.id === section}
                id={tabId(entry.id)}
                controls={panelId}
              >
                <button type="button" onClick={() => setSection(entry.id)}>
                  {entry.label}
                </button>
              </DeskTab>
            ))}
          </DeskTabs>
          {/* Only the open tab is mounted, so a closed tab runs no query. */}
          <DeskTabPanel id={panelId} tabId={tabId(section)} className="min-w-0 pt-1">
            {section === "offerings" ? (
              <VoucherOfferingsDesk
                address={voucherAddress}
                symbol={symbol}
                voucherValue={detail?.voucherValue ?? null}
                voucherUoa={detail?.voucherUoa ?? null}
                ownerAddress={detail?.ownerAddress ?? null}
                layout="panel"
              />
            ) : section === "reviews" ? (
              <VoucherReviewsDesk address={voucherAddress} layout="panel" />
            ) : section === "posts" ? (
              <VoucherPostsDesk
                voucher={reportVoucher}
                voucherName={name}
                voucherDataPending={!detail}
                canWritePost={canEdit}
                layout="panel"
              />
            ) : section === "info" ? (
              <VoucherInfoDesk
                address={voucherAddress}
                symbol={symbol}
                decimals={detail?.decimals ?? undefined}
                ownerAddress={detail?.ownerAddress ?? null}
                detail={detail}
                privateInfo={privateInfo}
              />
            ) : (
              <VoucherActivityDesk
                accountAddress={walletAddress}
                contractAddress={voucherAddress}
                layout="panel"
              />
            )}
          </DeskTabPanel>
        </div>
      )}
    </div>
  );
}
