import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { formatVoucherRate } from "@clc/core/features/market/logic";
import { formatTokenAmount, isVoucherCreationTransfer } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Suspense, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiNavigationLine,
  RiSparkling2Line,
} from "react-icons/ri";
import { useConnection } from "wagmi";

import { ReportList } from "#/components/reports/report-list";
import { VoucherReviewsPanel } from "#/components/reviews/voucher-reviews-panel";
import { Button } from "#/components/ui/button";
import { ResourceQuotaTitle } from "#/components/resource-usage";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { SectionHeading } from "#/components/ui/section-heading";
import { Skeleton } from "#/components/ui/skeleton";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { TransferDetailsSheet, type TransferDetails } from "#/components/wallet";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { useVoucherReportsInfinite } from "#/features/home/hooks/use-reports";
import { useAccountTransfersInfinite } from "#/features/wallet/hooks/use-account-balances";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";
import { openDefaultMaps } from "#/lib/default-maps";
import { cn } from "#/lib/utils";
import { VoucherAbout } from "./voucher-about";
import { VoucherContractActionsPanel } from "./voucher-contract-actions-panel";
import { VoucherOfferingsPanel } from "./voucher-offerings-panel";

export type VoucherDetailSection = "offerings" | "activity" | "info" | "reviews" | "posts";

type TxKind = "in" | "out";

const TX_ICON: Record<TxKind, ReactNode> = {
  in: <RiArrowLeftDownLine className="size-3.5" aria-hidden="true" />,
  out: <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />,
};

const TX_ICON_CLASS: Record<TxKind, string> = {
  in: "text-primary",
  out: "text-destructive",
};

/**
 * The complete content below a voucher's identity summary. The page and map
 * sheet intentionally render this exact component so management, pagination,
 * and interaction behavior cannot drift between the two surfaces.
 */
export function VoucherDetailSections({
  address,
  detail,
  symbol,
  name,
  decimals,
  ownerAddress,
  chainId,
  voucherValue,
  voucherUoa,
  description,
  email,
  website,
  phone,
  terms,
  locationName,
  lat,
  lng,
  dataPending,
  headingLevel = 2,
  idPrefix = "voucher-section",
  className,
}: {
  address: string;
  detail: MarketVoucherDetail | undefined;
  symbol: string;
  name: string;
  decimals?: number;
  ownerAddress: string | null;
  chainId: number | null;
  voucherValue: string | null;
  voucherUoa: string | null;
  description: string | null;
  email: string | null;
  website: string | null;
  phone: string | null;
  terms: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  dataPending: boolean;
  headingLevel?: 2 | 3;
  idPrefix?: string;
  className?: string;
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const { address: walletAddress } = useConnection();
  const canEditDetails =
    auth.isAuthenticated &&
    !!detail &&
    (auth.session?.role === "SUPERADMIN" ||
      (!!auth.session?.address &&
        !!detail.ownerAddress &&
        auth.session.address.toLowerCase() === detail.ownerAddress.toLowerCase()));
  const reportVoucher: VoucherRef | undefined =
    chainId && address ? { chainId, address: address as VoucherRef["address"] } : undefined;
  const rate = formatVoucherRate(voucherValue, voucherUoa);
  const usage = useResourceUsage(canEditDetails, address);

  return (
    <div className={cn("space-y-8 pb-6", className)}>
      <VoucherSection
        id="offerings"
        accessibleTitle={t`Offerings`}
        title={
          canEditDetails ? (
            <ResourceQuotaTitle
              quota={usage.data?.offers}
              pending={usage.isPending}
              error={usage.isError}
            >
              <Trans>Offerings</Trans>
            </ResourceQuotaTitle>
          ) : (
            <Trans>Offerings</Trans>
          )
        }
        {...{ idPrefix, headingLevel }}
      >
        <VoucherOfferingsPanel
          key={address}
          voucherAddress={address}
          voucherSymbol={symbol}
          voucherValue={voucherValue}
          voucherUoa={voucherUoa}
          ownerAddress={ownerAddress}
          openVoucherPageAction="close"
          presentation="section"
          manualPageSize={3}
          autoLoadMore={false}
        />
      </VoucherSection>

      <VoucherSection id="reviews" title={<Trans>Reviews</Trans>} {...{ idPrefix, headingLevel }}>
        <VoucherReviewsPanel key={address} address={address} presentation="section" />
      </VoucherSection>

      <VoucherSection id="posts" title={<Trans>Posts</Trans>} {...{ idPrefix, headingLevel }}>
        <VoucherPostsPanel
          voucher={reportVoucher}
          voucherName={name}
          voucherDataPending={dataPending}
          canWritePost={canEditDetails}
        />
      </VoucherSection>

      <VoucherSection id="info" title={<Trans>Info</Trans>} {...{ idPrefix, headingLevel }}>
        <VoucherInfoPanel
          rate={rate}
          symbol={symbol}
          description={description}
          contractAddress={address}
          email={email}
          website={website}
          phone={phone}
          terms={terms}
          issuerAddress={ownerAddress}
          locationName={locationName}
          lat={lat}
          lng={lng}
          editable={canEditDetails ? detail : null}
          contractActions={{
            tokenAddress: address,
            tokenSymbol: symbol,
            tokenDecimals: decimals,
            ownerAddress,
            walletAddress,
            requesterAddress: auth.isAuthenticated ? auth.session?.address : undefined,
          }}
        />
      </VoucherSection>

      <VoucherSection id="activity" title={<Trans>Activity</Trans>} {...{ idPrefix, headingLevel }}>
        <VoucherActivityPanel accountAddress={walletAddress} contractAddress={address} />
      </VoucherSection>
    </div>
  );
}

function VoucherSection({
  id,
  idPrefix,
  headingLevel,
  title,
  accessibleTitle,
  children,
}: {
  id: VoucherDetailSection;
  idPrefix: string;
  headingLevel: 2 | 3;
  title: ReactNode;
  accessibleTitle?: string;
  children: ReactNode;
}) {
  const headingID = `${idPrefix}-${id}`;

  return (
    <section aria-label={accessibleTitle} aria-labelledby={accessibleTitle ? undefined : headingID}>
      <SectionHeading
        as={headingLevel === 2 ? "h2" : "h3"}
        id={headingID}
        tabIndex={-1}
        className="mb-3 scroll-mt-4 focus:outline-none"
      >
        {title}
      </SectionHeading>
      {children}
    </section>
  );
}

function VoucherPostsPanel({
  voucher,
  voucherName,
  voucherDataPending,
  canWritePost,
}: {
  voucher: VoucherRef | undefined;
  voucherName: string;
  voucherDataPending: boolean;
  canWritePost: boolean;
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const reportsQuery = useVoucherReportsInfinite(voucher, 3, auth.isAuthenticated && !!voucher);
  const reports = reportsQuery.data?.pages.flatMap((page) => page.reports) ?? [];

  let content: ReactNode;
  if (auth.isLoading || (auth.isAuthenticated && !voucher && voucherDataPending)) {
    content = (
      <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
        <Trans>Loading posts…</Trans>
      </div>
    );
  } else if (!auth.isAuthenticated) {
    content = (
      <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
        <Trans>Sign in to view posts.</Trans>
      </div>
    );
  } else if (!voucher) {
    content = (
      <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
        <Trans>Posts aren't available for this voucher.</Trans>
      </div>
    );
  } else if (reportsQuery.isPending) {
    content = (
      <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
        <Trans>Loading posts…</Trans>
      </div>
    );
  } else if (reportsQuery.isError) {
    content = (
      <div className="space-y-2 border border-border bg-card p-4">
        <p className="text-muted-foreground text-sm">
          <Trans>Couldn't load posts.</Trans>
        </p>
        <Button
          variant="outline"
          tap
          pending={reportsQuery.isFetching}
          onClick={() => void reportsQuery.refetch()}
        >
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  } else if (reports.length === 0) {
    content = (
      <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
        <Trans>No posts yet.</Trans>
      </div>
    );
  } else {
    content = <ReportList reports={reports} ariaLabel={t`Posts`} />;
  }

  return (
    <div className="space-y-2">
      {canWritePost && voucher ? (
        <Button asChild tap className="w-full">
          <Link
            to="/posts/new"
            search={{ voucher: voucher.address, chainId: voucher.chainId, voucherName }}
          >
            <Trans>Write a post</Trans>
          </Link>
        </Button>
      ) : null}
      {content}
      {reportsQuery.hasNextPage ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={reportsQuery.isFetchingNextPage}
          onClick={() => void reportsQuery.fetchNextPage()}
        >
          {reportsQuery.isFetchingNextPage ? t`Loading…` : t`Load more`}
        </Button>
      ) : null}
    </div>
  );
}

function VoucherActivityPanel({
  accountAddress,
  contractAddress,
}: {
  accountAddress: string | undefined;
  contractAddress: string;
}) {
  const { i18n } = useLingui();
  const transfersQuery = useAccountTransfersInfinite(accountAddress, { poll: true });
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  const transfers = useMemo(() => {
    const allTransfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];
    return allTransfers.filter(
      (transfer) => transfer.tokenAddress.toLowerCase() === contractAddress.toLowerCase(),
    );
  }, [contractAddress, transfersQuery.data]);
  const visibleTransfers = transfers.slice(0, visibleCount);
  const hasMoreTransfers = visibleCount < transfers.length || transfersQuery.hasNextPage;

  return (
    <>
      <div className="border border-border bg-card">
        {!accountAddress ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>Sign in to view activity.</Trans>
          </div>
        ) : null}
        {accountAddress && transfersQuery.isPending ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>Loading activity…</Trans>
          </div>
        ) : null}
        {accountAddress && transfersQuery.isError ? (
          <div className="space-y-2 p-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load activity.</Trans>
            </p>
            <Button
              variant="outline"
              tap
              pending={transfersQuery.isFetching}
              onClick={() => void transfersQuery.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {accountAddress &&
        transfersQuery.isSuccess &&
        transfers.length === 0 &&
        !transfersQuery.hasNextPage ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>No activity yet.</Trans>
          </div>
        ) : null}
        {visibleTransfers.map((transfer, index, list) => {
          const kind = transfer.direction === "IN" ? "in" : "out";
          const created = isVoucherCreationTransfer(transfer);
          const transferDate = formatTransferDate(transfer.dateBlock);
          const uoaLabel = formatTransferUnitValue(
            transfer.uoaValue,
            transfer.uoa,
            i18n.locales?.[0] ?? i18n.locale,
          );
          return (
            <button
              key={`${transfer.txHash}-${transfer.id}`}
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 p-3 text-start",
                index < list.length - 1 && "border-b border-border",
              )}
              onClick={() => setSelectedTransfer(transfer)}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center bg-muted",
                  created ? "text-foreground" : TX_ICON_CLASS[kind],
                )}
              >
                {created ? (
                  <RiSparkling2Line className="size-3.5" aria-hidden="true" />
                ) : (
                  TX_ICON[kind]
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {created ? (
                    <Trans>Created</Trans>
                  ) : transfer.direction === "IN" ? (
                    <Trans>Received</Trans>
                  ) : (
                    <Trans>Sent</Trans>
                  )}
                </span>
                <span className="block truncate text-muted-foreground text-xs">
                  {created ? (
                    <Trans>New supply</Trans>
                  ) : (
                    <>
                      {transfer.direction === "IN" ? <Trans>From</Trans> : <Trans>To</Trans>}{" "}
                      <RecipientIdentityLabel address={transfer.counterpartyAddress} />
                    </>
                  )}
                  {transferDate ? (
                    <>
                      <span aria-hidden="true"> · </span>
                      <time dateTime={transfer.dateBlock}>{transferDate}</time>
                    </>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-end font-mono text-xs font-semibold">
                <span className="block">
                  {formatTokenAmount(transfer.amount, transfer.tokenDecimals)}{" "}
                  {transfer.tokenSymbol}
                </span>
                {uoaLabel ? (
                  <span className="block text-muted-foreground">({uoaLabel})</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {hasMoreTransfers ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={transfersQuery.isFetchingNextPage}
          onClick={() => {
            if (visibleCount >= transfers.length && transfersQuery.hasNextPage) {
              void Promise.resolve(transfersQuery.fetchNextPage()).then(() =>
                setVisibleCount((current) => current + 3),
              );
              return;
            }
            setVisibleCount((current) => current + 3);
          }}
        >
          {transfersQuery.isFetchingNextPage ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
        </Button>
      ) : null}

      <TransferDetailsSheet
        transfer={selectedTransfer}
        open={selectedTransfer !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTransfer(null);
        }}
      />
    </>
  );
}

function VoucherInfoPanel({
  locationName,
  lat,
  lng,
  editable,
  contractActions,
  ...about
}: ComponentProps<typeof VoucherAbout> & {
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  editable: MarketVoucherDetail | null;
  contractActions: Omit<ComponentProps<typeof VoucherContractActionsPanel>, "editable">;
}) {
  const hasCoordinates = typeof lat === "number" && typeof lng === "number";
  const locationLabel = locationName ?? (hasCoordinates ? `${lat}, ${lng}` : null);

  return (
    <div className="space-y-3">
      <VoucherContractActionsPanel {...contractActions} editable={editable} />
      <VoucherAbout {...about} />

      {locationLabel ? (
        <div className="border border-border bg-card p-4">
          <p className="text-sm font-semibold leading-snug">{locationLabel}</p>
          {hasCoordinates ? (
            <Suspense fallback={<Skeleton className="mt-3 h-36 w-full rounded-none" />}>
              <LocationMap lat={lat} lng={lng} className="mt-3 h-36 rounded-none border-0" />
            </Suspense>
          ) : null}
          <Button
            variant="outline"
            tap
            className="mt-3 w-full"
            onClick={() => openDefaultMaps({ label: locationName, lat, lng })}
          >
            <RiNavigationLine className="size-4" aria-hidden="true" />
            <Trans>Open in Maps</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
