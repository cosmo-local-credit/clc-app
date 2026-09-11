import { formatVoucherRate } from "@clc/core/features/market/logic";
import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiCoinLine,
  RiDownloadLine,
  RiFileCopyLine,
  RiNavigationLine,
  RiPencilLine,
  RiSendPlane2Line,
} from "react-icons/ri";
import { toast } from "sonner";
import { useConnection } from "wagmi";

import { Button } from "#/components/ui/button";
import { Field } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { ReportList } from "#/components/reports/report-list";
import { InfoRow } from "#/components/ui/info-row";
import { LocationMap } from "#/components/ui/location-map.lazy";
import { Skeleton } from "#/components/ui/skeleton";
import {
  BackChevron,
  EllipsizedAddress,
  TransferDetailsSheet,
  VoucherAvatar,
  WALLET_TOKEN_BY_ID,
  type TransferDetails,
  type WalletToken,
} from "#/components/wallet";
import { useMarketVoucherDetail } from "#/features/home/hooks/use-market-voucher-detail";
import { useVoucherReportsInfinite } from "#/features/home/hooks/use-reports";
import { useUpdateVoucherDisplayName } from "#/features/wallet/hooks/use-update-voucher-display-name";
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
import { VoucherOfferingsPanel } from "./voucher-offerings-panel";

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
    ownerEns: baseToken?.ownerEns,
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
  const locationName = detail?.locationName ?? poolVoucher?.locationName ?? token.location ?? null;
  const lat = detail?.lat ?? token.lat ?? null;
  const lng = detail?.lng ?? token.lng ?? null;
  const sendToken = contractAddress ?? token.id;
  const issuerAddress = token.owner ?? null;
  const canEditDisplayName =
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

      {canEditDisplayName ? (
        // Keyed so a fresh catalog name discards a stale draft instead of syncing state.
        <VoucherDisplayNameEditor
          key={detail.name}
          voucherAddress={detail.address}
          currentName={detail.name}
        />
      ) : null}

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
        <Button asChild variant="outline" className="h-14 flex-col gap-1 px-1">
          <Link to="/wallet/receive">
            <RiDownloadLine className="size-4" aria-hidden="true" />
            <span className="text-[0.6875rem] font-semibold">
              <Trans>Receive</Trans>
            </span>
          </Link>
        </Button>
      </div>

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
          issuerAddress={token.owner ?? null}
          locationName={locationName}
          lat={lat}
          lng={lng}
        />
      ) : null}
      {activeTab === "posts" ? (
        <VoucherPostsPanel
          voucher={reportVoucher}
          voucherName={token.name}
          voucherDataPending={detailQuery.isPending || supportingDataPending}
        />
      ) : null}
      {activeTab === "reviews" ? (
        <EmptyTabPanel tab="reviews">
          <Trans>Reviews for this voucher will appear here.</Trans>
        </EmptyTabPanel>
      ) : null}
    </div>
  );
}

/**
 * The catalog label is the one thing about a deployed voucher its owner can still
 * correct. Collapsed to a single control until asked for, so the hero stays the
 * hero; the ERC20 name on chain is untouched either way.
 */
function VoucherDisplayNameEditor({
  voucherAddress,
  currentName,
}: {
  voucherAddress: string;
  currentName: string;
}) {
  const { t } = useLingui();
  const update = useUpdateVoucherDisplayName(voucherAddress);
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 self-start px-0 text-muted-foreground hover:bg-transparent"
        onClick={() => setDraft(currentName)}
      >
        <RiPencilLine aria-hidden="true" />
        <Trans>Rename voucher</Trans>
      </Button>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = (draft ?? "").trim();
    if (!next) {
      toast.error(t`Display name cannot be blank.`);
      return;
    }
    if (next === currentName) {
      setDraft(null);
      return;
    }
    void update.mutateAsync(next).then(
      () => {
        toast.success(t`Display name updated.`);
        setDraft(null);
      },
      (error: unknown) =>
        toast.error(error instanceof Error ? error.message : t`Could not update the display name.`),
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 border border-border bg-card p-4">
      <Field
        label={t`Display name`}
        htmlFor="voucher-display-name"
        hint={t`Changes how the voucher is shown. The deployed contract keeps its name.`}
      >
        <Input
          id="voucher-display-name"
          value={draft}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          disabled={update.isPending}
          autoFocus
        />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => setDraft(null)}
          disabled={update.isPending}
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button type="submit" className="h-11" disabled={update.isPending}>
          {update.isPending ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
        </Button>
      </div>
    </form>
  );
}

function EmptyTabPanel({ tab, children }: { tab: "reviews"; children: ReactNode }) {
  return (
    <div
      id={`voucher-panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`voucher-tab-${tab}`}
      className="border border-border bg-card p-4 text-muted-foreground text-sm"
    >
      {children}
    </div>
  );
}

function VoucherPostsPanel({
  voucher,
  voucherName,
  voucherDataPending,
}: {
  voucher: VoucherRef | undefined;
  voucherName: string;
  voucherDataPending: boolean;
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
          and arrives already linked. */}
      {auth.isAuthenticated && voucher ? (
        <Button asChild size="sm" className="h-9 w-full">
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
          const transferDate = formatTransferDate(transfer.dateBlock);
          return (
            <button
              key={`${transfer.txHash}-${transfer.id}`}
              type="button"
              className={[
                "flex w-full items-center gap-2.5 p-3 text-left",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
              onClick={() => setSelectedTransfer(transfer)}
            >
              <span
                className={[
                  "flex size-7 shrink-0 items-center justify-center bg-muted",
                  TX_ICON_CLASS[kind],
                ].join(" ")}
              >
                {TX_ICON[kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {transfer.direction === "IN" ? <Trans>Received</Trans> : <Trans>Sent</Trans>}
                </span>
                <span className="block truncate text-muted-foreground text-[0.6875rem]">
                  {transfer.direction === "IN" ? <Trans>From</Trans> : <Trans>To</Trans>}{" "}
                  <EllipsizedAddress address={transfer.counterpartyAddress} />
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
  rate,
  symbol,
  description,
  contractAddress,
  email,
  website,
  phone,
  issuerAddress,
  locationName,
  lat,
  lng,
}: {
  rate: { value: string; unit: string } | null;
  symbol: string;
  description: string | null;
  contractAddress: string | undefined;
  email: string | null;
  website: string | null;
  phone: string | null;
  issuerAddress: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
}) {
  const { t } = useLingui();
  const hasCoordinates = typeof lat === "number" && typeof lng === "number";
  const locationLabel = locationName ?? (hasCoordinates ? `${lat}, ${lng}` : null);

  return (
    <div
      id="voucher-panel-info"
      role="tabpanel"
      aria-labelledby="voucher-tab-info"
      className="space-y-3"
    >
      {rate || description ? (
        <div className="space-y-3 border border-border bg-card p-4">
          {rate ? (
            <p className="font-mono text-sm font-semibold leading-tight text-primary">
              <Trans>
                1 {symbol} = {rate.value} {rate.unit}
              </Trans>
            </p>
          ) : null}
          {description ? <p className="text-sm leading-relaxed">{description}</p> : null}
        </div>
      ) : null}

      <dl className="border border-border bg-card">
        <InfoRow label={t`Contract address`}>
          {contractAddress ? (
            <button
              type="button"
              aria-label={t`Copy contract address`}
              className="flex min-w-0 items-center gap-1.5"
              onClick={() => {
                if (!navigator.clipboard) {
                  toast.error(t`Couldn't copy contract address`);
                  return;
                }
                void navigator.clipboard
                  .writeText(contractAddress)
                  .then(() => toast.success(t`Contract address copied`))
                  .catch(() => toast.error(t`Couldn't copy contract address`));
              }}
            >
              <EllipsizedAddress address={contractAddress} />
              <span className="flex size-6 shrink-0 items-center justify-center bg-muted text-muted-foreground">
                <RiFileCopyLine className="size-3" aria-hidden="true" />
              </span>
            </button>
          ) : (
            "—"
          )}
        </InfoRow>
        {email ? (
          <InfoRow label={t`Email`}>
            <a
              href={`mailto:${email}`}
              className="max-w-full truncate underline underline-offset-2"
            >
              {email}
            </a>
          </InfoRow>
        ) : null}
        <InfoRow label={t`Website`}>
          {website ? (
            <a
              href={website}
              target="_blank"
              rel="noreferrer noopener"
              className="max-w-full truncate underline underline-offset-2"
            >
              {website}
            </a>
          ) : (
            "—"
          )}
        </InfoRow>
        {phone ? (
          <InfoRow label={t`Phone`}>
            <a href={`tel:${phone}`} className="max-w-full truncate underline underline-offset-2">
              {phone}
            </a>
          </InfoRow>
        ) : null}
        <InfoRow label={t`Issuer`}>
          {issuerAddress ? <EllipsizedAddress address={issuerAddress} /> : "—"}
        </InfoRow>
      </dl>

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
