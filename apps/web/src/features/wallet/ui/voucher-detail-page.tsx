import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { formatVoucherRate } from "@clc/core/features/market/logic";
import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { formatTokenAmount, isVoucherCreationTransfer } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiCoinLine,
  RiGroupLine,
  RiNavigationLine,
  RiSendPlane2Line,
  RiSparkling2Line,
} from "react-icons/ri";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { VoucherReviewsPanel } from "#/components/reviews/voucher-reviews-panel";
import { VoucherAbout } from "#/components/vouchers/voucher-about";
import { VoucherOfferingsPanel } from "#/components/vouchers/voucher-offerings-panel";
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
import { useVoucherReportsInfinite } from "#/features/home/hooks/use-reports";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { usePoolVouchersInfinite } from "#/features/pools/hooks/use-pool-vouchers";
import { poolVoucherToWalletToken } from "#/features/pools/logic/pool-voucher-display";
import {
  useAccountTokensInfinite,
  useAccountTransfersInfinite,
} from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { openDefaultMaps } from "#/lib/default-maps";
import {
  resolveVoucherNavigationOwner,
  type VoucherOrigin,
} from "#/lib/navigation/voucher-navigation-owner";
import { VoucherContractActionsPanel } from "./voucher-contract-actions-panel";

export type { VoucherOrigin } from "#/lib/navigation/voucher-navigation-owner";

type TxKind = "in" | "out";
type VoucherDetailTab = "offerings" | "activity" | "info" | "reviews" | "posts";

const VOUCHER_TABS: VoucherDetailTab[] = ["offerings", "info", "activity", "reviews", "posts"];

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
  activeTab: VoucherDetailTab;
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
  const tokensQuery = useAccountTokensInfinite(address, { perPage: 50 });
  const poolVouchersQuery = usePoolVouchersInfinite(poolAddress);
  const normalizedVoucherAddress = voucherAddress.toLowerCase();
  const fetchedTokens =
    tokensQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [];
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
  const supportingDataPending =
    (!!address && tokensQuery.isPending) || (!!poolAddress && poolVouchersQuery.isPending);

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
  const issuerAddress = token.owner ?? null;
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
  // Redeeming is sending the voucher back to whoever issued it.
  const redeemContent = (
    <>
      <RiCoinLine className="size-4" aria-hidden="true" />
      <span className="text-[0.6875rem] font-semibold">
        <Trans>Redeem</Trans>
      </span>
    </>
  );

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
          <h1 className="min-w-0 font-heading text-[1.75rem] font-bold leading-tight [overflow-wrap:anywhere]">
            {token.name}
          </h1>
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

      <div className="my-4 grid grid-cols-3 gap-2" aria-label={t`Voucher actions`}>
        {issuerAddress ? (
          <Button asChild className="h-14 flex-col gap-1 px-1">
            <Link to="/wallet/send/amount" search={{ token: sendToken, recipient: issuerAddress }}>
              {redeemContent}
            </Link>
          </Button>
        ) : (
          <Button
            className="h-14 flex-col gap-1 px-1 disabled:bg-primary disabled:text-primary-foreground disabled:opacity-70"
            disabled
          >
            {redeemContent}
          </Button>
        )}
        <Button asChild variant="outline" className="h-14 flex-col gap-1 px-1">
          <Link to="/wallet/send" search={{ token: sendToken }}>
            <RiSendPlane2Line className="size-4" aria-hidden="true" />
            <span className="text-[0.6875rem] font-semibold">
              <Trans>Send</Trans>
            </span>
          </Link>
        </Button>
        <Button asChild variant="info" className="h-14 flex-col gap-1 px-1">
          <Link
            to="/pools"
            search={{ out_voucher: (contractAddress ?? voucherAddress).toLowerCase() }}
          >
            <RiGroupLine className="size-4" aria-hidden="true" />
            <span className="text-[0.6875rem] font-semibold">
              <Trans>Pools</Trans>
            </span>
          </Link>
        </Button>
      </div>

      {detail ? (
        <div className="mb-4">
          <AddToCatalogButton kind="voucher" resourceId={detail.id} address={detail.address} />
        </div>
      ) : null}

      <div
        className="mb-3 grid grid-cols-5 border border-border bg-card p-1"
        role="tablist"
        aria-label={t`Voucher details`}
      >
        {VOUCHER_TABS.map((tab) => {
          const label =
            tab === "offerings" ? (
              <Trans>Offerings</Trans>
            ) : tab === "activity" ? (
              <Trans>Activity</Trans>
            ) : tab === "info" ? (
              <Trans>Info</Trans>
            ) : tab === "reviews" ? (
              <Trans>Reviews</Trans>
            ) : (
              <Trans>Posts</Trans>
            );
          const className = [
            "flex h-10 min-w-0 items-center justify-center px-1 text-[0.6875rem] font-semibold",
            activeTab === tab ? "bg-foreground text-background" : "text-muted-foreground",
          ].join(" ");

          if (activeTab === tab) {
            return (
              <button
                key={tab}
                type="button"
                id={`voucher-tab-${tab}`}
                role="tab"
                aria-selected="true"
                aria-controls={`voucher-panel-${tab}`}
                className={className}
              >
                {label}
              </button>
            );
          }

          return (
            <Link
              key={tab}
              id={`voucher-tab-${tab}`}
              role="tab"
              aria-selected="false"
              aria-controls={`voucher-panel-${tab}`}
              to="/vouchers/$voucherAddress"
              params={{ voucherAddress }}
              search={{
                tab: tab === "offerings" ? undefined : tab,
                from: origin === "market" ? undefined : origin,
                poolAddress,
              }}
              // Switching panel on the same screen is not a navigation: Back
              // must leave the voucher, not walk back through visited tabs.
              replace
              resetScroll={false}
              className={className}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {activeTab === "offerings" ? (
        <VoucherOfferingsPanel
          voucherAddress={contractAddress}
          voucherSymbol={token.symbol}
          voucherValue={voucherValue}
          voucherUoa={voucherUoa}
          ownerAddress={detail?.ownerAddress ?? null}
          isKnownEmpty={detail?.kind === "voucher"}
          openVoucherPageAction="close"
        />
      ) : null}
      {activeTab === "activity" ? (
        <VoucherActivityPanel accountAddress={address} contractAddress={contractAddress} />
      ) : null}
      {activeTab === "info" ? (
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
            // A retired voucher's page no longer resolves, so leave for wherever
            // Back already points — the pool, the wallet or the market the
            // viewer arrived from. `replace` so Back does not return them to a
            // screen that would now fail to load.
            onRetired: () => {
              void navigate({ to: back.to, search: back.search, replace: true });
            },
          }}
        />
      ) : null}
      {activeTab === "posts" ? (
        <VoucherPostsPanel
          voucher={reportVoucher}
          voucherName={token.name}
          voucherDataPending={detailQuery.isPending || supportingDataPending}
          canWritePost={canEditDetails}
        />
      ) : null}
      {activeTab === "reviews" ? (
        <VoucherReviewsPanel
          key={contractAddress ?? voucherAddress}
          address={contractAddress ?? voucherAddress}
        />
      ) : null}
    </div>
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
  const reportsQuery = useVoucherReportsInfinite(voucher, 20, auth.isAuthenticated && !!voucher);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const reports = reportsQuery.data?.pages.flatMap((page) => page.reports) ?? [];

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !reportsQuery.hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !reportsQuery.isFetchingNextPage) {
        void reportsQuery.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [reportsQuery.fetchNextPage, reportsQuery.hasNextPage, reportsQuery.isFetchingNextPage]);

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
    <div
      id="voucher-panel-posts"
      role="tabpanel"
      aria-labelledby="voucher-tab-posts"
      className="space-y-2"
    >
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
      <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
      {reportsQuery.isFetchingNextPage ? (
        <p className="text-center text-muted-foreground text-xs">
          <Trans>Loading more…</Trans>
        </p>
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
  const transfersQuery = useAccountTransfersInfinite(accountAddress, { poll: true });
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const transfers = useMemo(() => {
    const allTransfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];
    if (!contractAddress) return allTransfers;
    return allTransfers.filter(
      (transfer) => transfer.tokenAddress.toLowerCase() === contractAddress.toLowerCase(),
    );
  }, [contractAddress, transfersQuery.data]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !transfersQuery.hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && !transfersQuery.isFetchingNextPage) {
        void transfersQuery.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [transfersQuery.fetchNextPage, transfersQuery.hasNextPage, transfersQuery.isFetchingNextPage]);

  return (
    <>
      <div
        id="voucher-panel-activity"
        className="border border-border bg-card"
        role="tabpanel"
        aria-labelledby="voucher-tab-activity"
      >
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
        {accountAddress && transfersQuery.isSuccess && transfers.length === 0 ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>No activity yet.</Trans>
          </div>
        ) : null}
        {transfers.map((transfer, index, list) => {
          const kind = transfer.direction === "IN" ? "in" : "out";
          const created = isVoucherCreationTransfer(transfer);
          const transferDate = formatTransferDate(transfer.dateBlock);
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
              <span className="shrink-0 font-mono text-xs font-semibold">
                {formatTokenAmount(transfer.amount, transfer.tokenDecimals)}
              </span>
            </button>
          );
        })}
        <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
        {transfersQuery.isFetchingNextPage ? (
          <div className="p-3 text-center text-muted-foreground text-xs">
            <Trans>Loading more…</Trans>
          </div>
        ) : null}
      </div>

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
    <div
      id="voucher-panel-info"
      role="tabpanel"
      aria-labelledby="voucher-tab-info"
      className="space-y-3"
    >
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
