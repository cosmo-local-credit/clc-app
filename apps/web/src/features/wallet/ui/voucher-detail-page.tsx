import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { formatVoucherRate } from "@clc/core/features/market/logic";
import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { formatTokenAmount, isVoucherCreationTransfer } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiNavigationLine,
  RiSparkling2Line,
} from "react-icons/ri";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { VoucherReviewsPanel } from "#/components/reviews/voucher-reviews-panel";
import { VoucherAbout } from "#/components/vouchers/voucher-about";
import { VoucherOfferingsPanel } from "#/components/vouchers/voucher-offerings-panel";
import { useMarketDistanceLabel } from "#/components/vouchers/voucher-labels";
import {
  ShareVoucherButton,
  VoucherActionRow,
  VoucherReviewSummaryContent,
  VoucherTagList,
} from "#/components/vouchers/voucher-summary";
import { ReportList } from "#/components/reports/report-list";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { Skeleton } from "#/components/ui/skeleton";
import {
  BackChevron,
  TransferDetailsSheet,
  VoucherAvatar,
  WALLET_TOKEN_BY_ID,
  type TransferDetails,
  type WalletToken,
} from "#/components/wallet";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useDiscoveryDistanceOrigin } from "#/features/home/hooks/use-discovery-distance-origin";
import { useVoucherReportsInfinite } from "#/features/home/hooks/use-reports";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { usePoolVouchersInfinite } from "#/features/pools/hooks/use-pool-vouchers";
import { poolVoucherToWalletToken } from "#/features/pools/logic/pool-voucher-display";
import {
  useAllAccountTokens,
  useAccountTransfersInfinite,
} from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";
import { openDefaultMaps } from "#/lib/default-maps";
import {
  resolveVoucherNavigationOwner,
  type VoucherOrigin,
} from "#/lib/navigation/voucher-navigation-owner";
import { VoucherContractActionsPanel } from "./voucher-contract-actions-panel";

export type { VoucherOrigin } from "#/lib/navigation/voucher-navigation-owner";

type TxKind = "in" | "out";
type VoucherDetailSection = "offerings" | "activity" | "info" | "reviews" | "posts";

const TX_ICON: Record<TxKind, ReactNode> = {
  in: <RiArrowLeftDownLine className="size-3.5" aria-hidden="true" />,
  out: <RiArrowRightUpLine className="size-3.5" aria-hidden="true" />,
};

const TX_ICON_CLASS: Record<TxKind, string> = {
  in: "text-primary",
  out: "text-destructive",
};

export function VoucherDetailPage({
  voucherAddress,
  activeTab,
  origin = "market",
  poolAddress,
}: {
  voucherAddress: string;
  /** A legacy tab URL now identifies the section to focus on first render. */
  activeTab?: VoucherDetailSection;
  origin?: VoucherOrigin;
  poolAddress?: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { address } = useConnection();
  const auth = useAuthStatus();
  const voucherNavigation = resolveVoucherNavigationOwner({ from: origin, poolAddress });
  const back = {
    label:
      voucherNavigation.backDestination === "pool"
        ? t`Pool`
        : voucherNavigation.backDestination === "wallet"
          ? t`Wallet`
          : voucherNavigation.backDestination === "vouchers"
            ? t`Vouchers`
            : t`Market`,
    to: voucherNavigation.to,
    search: voucherNavigation.search,
  };
  const holdingsAddress = auth.isAuthenticated ? (auth.session?.address ?? undefined) : undefined;
  const tokensQuery = useAllAccountTokens(holdingsAddress);
  const poolVouchersQuery = usePoolVouchersInfinite(poolAddress);
  const normalizedVoucherAddress = voucherAddress.toLowerCase();
  const fetchedTokens = tokensQuery.tokens.map(accountTokenToWalletToken);
  const fetchedToken = fetchedTokens.find((item) => item.id === normalizedVoucherAddress);
  const poolVoucher = poolVouchersQuery.data?.pages
    .flatMap((page) => page.vouchers)
    .find(
      (voucher) =>
        voucher.tokenAddress.toLowerCase() === normalizedVoucherAddress ||
        voucher.id === voucherAddress,
    );
  const catalogToken = poolVoucher ? poolVoucherToWalletToken(poolVoucher) : undefined;
  const staticToken =
    WALLET_TOKEN_BY_ID[voucherAddress] ??
    Object.values(WALLET_TOKEN_BY_ID).find(
      (item) => item.contractAddress?.toLowerCase() === normalizedVoucherAddress,
    );
  const baseToken = fetchedToken ?? catalogToken ?? staticToken;
  const detailAddress = baseToken?.contractAddress ?? voucherAddress;
  const detailQuery = useMarketVoucherDetail(detailAddress);
  const detail = detailQuery.data;
  const distanceOrigin = useDiscoveryDistanceOrigin(holdingsAddress ?? "voucher-detail");
  const distanceTarget =
    typeof (detail?.lat ?? baseToken?.lat) === "number" &&
    typeof (detail?.lng ?? baseToken?.lng) === "number"
      ? { lat: (detail?.lat ?? baseToken?.lat)!, lng: (detail?.lng ?? baseToken?.lng)! }
      : null;
  const distanceLabel = useMarketDistanceLabel(distanceOrigin, distanceTarget);
  const supportingDataPending =
    (!!holdingsAddress && tokensQuery.isPending) || (!!poolAddress && poolVouchersQuery.isPending);

  useEffect(() => {
    if (!activeTab || detailQuery.isPending || supportingDataPending) return;
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById(`voucher-section-${activeTab}`);
      if (!heading) return;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({
        behavior:
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, detailQuery.isPending, supportingDataPending]);

  if (!baseToken && !detail && (detailQuery.isPending || supportingDataPending)) {
    return <VoucherShell back={back} message={t`Loading voucher…`} />;
  }
  if (!baseToken && !detail && detailQuery.isError) {
    return (
      <VoucherShell back={back} message={t`Couldn't load this voucher.`}>
        <Button
          variant="outline"
          size="sm"
          className="bg-card"
          onClick={() => detailQuery.refetch()}
        >
          <Trans>Retry</Trans>
        </Button>
      </VoucherShell>
    );
  }

  const token: WalletToken = {
    id: baseToken?.id ?? detail?.address.toLowerCase() ?? normalizedVoucherAddress,
    symbol: detail?.symbol ?? baseToken?.symbol ?? "TOKEN",
    name: detail?.name ?? baseToken?.name ?? "Token",
    amount: baseToken?.amount ?? "0",
    fiat: baseToken?.fiat ?? "",
    color: baseToken?.color ?? "var(--primary)",
    kind: "voucher",
    admin: baseToken?.admin,
    location: detail?.locationName ?? baseToken?.location,
    phone: detail?.phone ?? baseToken?.phone,
    email: detail?.email ?? baseToken?.email,
    owner: detail?.ownerAddress ?? baseToken?.owner,
    contractAddress: detail?.address ?? baseToken?.contractAddress ?? voucherAddress,
    iconUrl: detail?.iconUrl ?? baseToken?.iconUrl,
    tokenDecimals: baseToken?.tokenDecimals ?? detail?.decimals ?? undefined,
    balance: baseToken?.balance,
    lastDateBlock: baseToken?.lastDateBlock,
    lat: detail?.lat ?? baseToken?.lat,
    lng: detail?.lng ?? baseToken?.lng,
  };
  const contractAddress = token.contractAddress;
  const voucherValue = detail?.voucherValue ?? poolVoucher?.voucherValue ?? null;
  const voucherUoa = detail?.voucherUoa ?? poolVoucher?.voucherUoa ?? null;
  const rate = formatVoucherRate(voucherValue, voucherUoa);
  const description = detail?.description ?? poolVoucher?.description ?? null;
  const website = detail?.website ?? null;
  const terms = detail?.terms ?? null;
  const locationName = detail?.locationName ?? poolVoucher?.locationName ?? token.location ?? null;
  const lat = detail?.lat ?? token.lat ?? null;
  const lng = detail?.lng ?? token.lng ?? null;
  const sendToken = contractAddress ?? token.id;
  const holding = tokensQuery.tokens.find(
    (item) => item.tokenAddress.toLowerCase() === sendToken.toLowerCase(),
  );
  const hasPositiveBalance =
    auth.isAuthenticated &&
    !!holding &&
    /^\d+$/.test(holding.balance) &&
    BigInt(holding.balance) > 0n;
  const place = distanceLabel ?? locationName;
  const canEditDetails =
    auth.isAuthenticated &&
    !!detail &&
    (auth.session?.role === "SUPERADMIN" ||
      (!!auth.session?.address &&
        !!detail.ownerAddress &&
        auth.session.address.toLowerCase() === detail.ownerAddress.toLowerCase()));
  const reportChainId = detail?.chainId ?? poolVoucher?.chainId ?? null;
  const reportVoucher: VoucherRef | undefined =
    reportChainId && contractAddress
      ? { chainId: reportChainId, address: contractAddress as VoucherRef["address"] }
      : undefined;
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={back.label} to={back.to} search={back.search} />

      <div className="mt-1 flex items-start gap-3">
        <VoucherAvatar
          address={contractAddress ?? voucherAddress}
          symbol={token.symbol}
          iconUrl={token.iconUrl ?? null}
          size={56}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-1">
            <h1 className="min-w-0 flex-1 font-heading text-[1.75rem] font-bold leading-tight [overflow-wrap:anywhere]">
              {token.name}
            </h1>
            <ShareVoucherButton
              name={token.name}
              address={contractAddress ?? voucherAddress}
              destination="detail"
              className="-me-3 -mt-2"
            />
          </div>
          <p
            aria-label={t`Balance`}
            className="mt-1.5 font-heading text-[1.375rem] font-bold leading-none tracking-tight"
          >
            {token.amount}{" "}
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              {token.symbol}
            </span>
          </p>
        </div>
      </div>

      <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground text-xs">
        <VoucherReviewSummaryContent address={contractAddress ?? voucherAddress} place={place} />
      </p>
      <VoucherTagList tags={detail?.tags} className="mt-2" />

      <VoucherActionRow
        address={sendToken}
        name={token.name}
        ownerAddress={detail?.ownerAddress}
        hasPositiveBalance={hasPositiveBalance}
        locationName={locationName}
        lat={lat}
        lng={lng}
        phone={token.phone}
        website={website}
        className="my-3"
      />

      {detail ? (
        <div className="mb-6">
          <AddToCatalogButton kind="voucher" resourceId={detail.id} address={detail.address} />
        </div>
      ) : null}

      <div className="space-y-8 pb-6">
        <VoucherDetailSection id="offerings" title={<Trans>Offerings</Trans>}>
          <VoucherOfferingsPanel
            key={contractAddress ?? voucherAddress}
            voucherAddress={contractAddress}
            voucherSymbol={token.symbol}
            voucherValue={voucherValue}
            voucherUoa={voucherUoa}
            ownerAddress={detail?.ownerAddress ?? null}
            isKnownEmpty={detail?.kind === "voucher"}
            openVoucherPageAction="close"
            presentation="section"
            manualPageSize={3}
            autoLoadMore={false}
          />
        </VoucherDetailSection>

        <VoucherDetailSection id="reviews" title={<Trans>Reviews</Trans>}>
          <VoucherReviewsPanel
            key={contractAddress ?? voucherAddress}
            address={contractAddress ?? voucherAddress}
            presentation="section"
          />
        </VoucherDetailSection>

        <VoucherDetailSection id="posts" title={<Trans>Posts</Trans>}>
          <VoucherPostsPanel
            voucher={reportVoucher}
            voucherName={token.name}
            voucherDataPending={detailQuery.isPending || supportingDataPending}
            canWritePost={canEditDetails}
          />
        </VoucherDetailSection>

        <VoucherDetailSection id="info" title={<Trans>Info</Trans>}>
          <VoucherInfoPanel
            rate={rate}
            symbol={token.symbol}
            description={description}
            contractAddress={contractAddress}
            email={token.email ?? null}
            website={website}
            phone={token.phone ?? null}
            terms={terms}
            issuerAddress={token.owner ?? null}
            locationName={locationName}
            lat={lat}
            lng={lng}
            editable={canEditDetails ? detail : null}
            contractActions={{
              tokenAddress: contractAddress,
              tokenSymbol: token.symbol,
              tokenDecimals: token.tokenDecimals,
              ownerAddress: token.owner ?? null,
              walletAddress: address,
              onRetired: () => {
                void navigate({ to: back.to, search: back.search, replace: true });
              },
            }}
          />
        </VoucherDetailSection>

        <VoucherDetailSection id="activity" title={<Trans>Activity</Trans>}>
          <VoucherActivityPanel accountAddress={address} contractAddress={contractAddress} />
        </VoucherDetailSection>
      </div>
    </div>
  );
}

function VoucherDetailSection({
  id,
  title,
  children,
}: {
  id: VoucherDetailSection;
  title: ReactNode;
  children: ReactNode;
}) {
  const headingID = `voucher-section-${id}`;
  return (
    <section aria-labelledby={headingID}>
      <h2
        id={headingID}
        tabIndex={-1}
        className="mb-3 scroll-mt-4 font-heading text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] focus:outline-none"
      >
        {title}
      </h2>
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
  /**
   * Whether the viewer may link this voucher to a post: its owner or a
   * superadmin. clc-core refuses the write for anyone else, so the button that
   * seeds it is not offered to them.
   */
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
          size="sm"
          className="h-9 bg-card"
          onClick={() => reportsQuery.refetch()}
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
      {/* Writing about this voucher starts here as well as on the Posts screen.
          The editor is the same one either way — the voucher travels in the URL
          and arrives already linked. Only the issuer (or a superadmin) sees it:
          a post may only link vouchers its author owns. */}
      {canWritePost && voucher ? (
        <Button asChild className="h-9 w-full">
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
          className="h-11 w-full bg-card"
          disabled={reportsQuery.isFetchingNextPage}
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
  contractAddress: string | undefined;
}) {
  const { i18n } = useLingui();
  const transfersQuery = useAccountTransfersInfinite(accountAddress, { poll: true });
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  const transfers = useMemo(() => {
    const allTransfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];
    if (!contractAddress) return allTransfers;
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
              size="sm"
              className="h-9 bg-card"
              onClick={() => transfersQuery.refetch()}
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
              className={[
                "flex w-full items-center gap-2.5 p-3 text-start",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
              onClick={() => setSelectedTransfer(transfer)}
            >
              <span
                className={[
                  "flex size-7 shrink-0 items-center justify-center bg-muted",
                  created ? "text-foreground" : TX_ICON_CLASS[kind],
                ].join(" ")}
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
                <span className="block truncate text-muted-foreground text-[0.6875rem]">
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
          className="h-11 w-full bg-card"
          disabled={transfersQuery.isFetchingNextPage}
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
  /** The catalog record, when the viewer may edit it; null for everyone else. */
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
          <p className="font-heading text-sm font-semibold leading-snug">{locationLabel}</p>
          {hasCoordinates ? (
            <Suspense fallback={<Skeleton className="mt-3 h-36 w-full rounded-none" />}>
              <LocationMap lat={lat} lng={lng} className="mt-3 h-36 rounded-none border-0" />
            </Suspense>
          ) : null}
          <Button
            variant="outline"
            className="mt-3 h-11 w-full bg-card"
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

function VoucherShell({
  back,
  message,
  children,
}: {
  back: { label: string; to: string; search: Record<string, unknown> | undefined };
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
      <BackChevron label={back.label} to={back.to} search={back.search} />
      <p className="mt-6 text-muted-foreground text-sm">{message}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
