import type { PoolVoucher } from "@clc/api/features/pools/client";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useSearch } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  RiAddLine,
  RiArrowLeftRightLine,
  RiArrowRightUpLine,
  RiQrCodeLine,
  RiSettings3Line,
} from "react-icons/ri";

import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { MultisigOwnerNotice } from "#/components/safe/multisig-owner-notice";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { PoolLogo, TokenLogo } from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { usePoolVoucherRates } from "#/features/pools/hooks/use-pool-quoter";
import { usePoolVoucherTokens } from "#/features/pools/hooks/use-pool-voucher-tokens";
import { usePoolVouchersWithStatus } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";
import { PoolActivityPanel } from "#/features/pools/ui/pool-activity-panel";
import { PoolControlsPanel } from "#/features/pools/ui/pool-controls-panel";
import { PoolCreditPanel } from "#/features/pools/ui/pool-credit-panel";
import { PoolHoldingsPanel } from "#/features/pools/ui/pool-holdings-panel";
import { PoolInfoPanel } from "#/features/pools/ui/pool-info-panel";
import { PoolOfferingsPanel } from "#/features/pools/ui/pool-offerings-panel";
import { PoolReceiveSheet } from "#/features/pools/ui/pool-receive-sheet";
import { PoolVoucherSheet } from "#/features/pools/ui/pool-voucher-sheet";
import { PoolWantsPanel } from "#/features/pools/ui/pool-wants-panel";
import { cn } from "#/lib/utils";

const POOL_TABS = [
  "offerings",
  "wants",
  "vouchers",
  "holdings",
  "credit",
  "activity",
  "info",
] as const;

type PoolTab = (typeof POOL_TABS)[number];

function isPoolTab(value: string | undefined): value is PoolTab {
  return POOL_TABS.some((tab) => tab === value);
}

export function usePoolDeskReceive(): string | undefined {
  const search = useSearch({ strict: false }) as { receive?: unknown };
  return typeof search.receive === "string" ? search.receive.toLowerCase() : undefined;
}

function usePoolDeskTab(): PoolTab | undefined {
  const search = useSearch({ strict: false }) as { tab?: unknown };
  return typeof search.tab === "string" && isPoolTab(search.tab) ? search.tab : undefined;
}

export function PoolMain({ poolAddress }: { poolAddress: string }) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const requested = usePoolDeskTab() ?? "offerings";
  const receive = usePoolDeskReceive();
  const poolQuery = useUserPoolByAddress(
    poolAddress,
    auth.isAuthenticated ? auth.session?.address : undefined,
  );
  const pool = poolQuery.data;
  useDeskTrailLabel(pool?.name);
  const ownerInfo = useAssetOwnerInfo(poolAddress, pool?.ownerAddress);
  const isPoolOwner =
    auth.isAuthenticated &&
    !!pool &&
    !!auth.session?.address &&
    !!pool.ownerAddress &&
    ownerInfo.canManage;
  const poolVouchersQuery = usePoolVouchersWithStatus(pool, {
    all: true,
    owner: isPoolOwner ? auth.session?.address : undefined,
  });
  const poolVouchers = poolVouchersQuery.vouchers;
  const vouchers = poolVouchers.filter((voucher) => voucher.active);
  const voucherTokens = usePoolVoucherTokens(vouchers);
  const canEditDetails =
    auth.isAuthenticated && !!pool && (auth.session?.role === "SUPERADMIN" || isPoolOwner);
  const canManageOnChain = isPoolOwner;
  const rates = usePoolVoucherRates(pool, vouchers, canManageOnChain);
  const [managing, setManaging] = useState<PoolVoucher | null>(null);
  const [approving, setApproving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const selectedTab =
    pool?.active === false && requested !== "activity" && requested !== "info"
      ? "holdings"
      : requested;
  const visibleTabs =
    pool?.active === false
      ? POOL_TABS.filter((tab) => tab === "holdings" || tab === "activity" || tab === "info")
      : auth.isAuthenticated
        ? POOL_TABS
        : POOL_TABS.filter(
            (tab) => tab === "offerings" || tab === "wants" || tab === "vouchers" || tab === "info",
          );

  if (poolQuery.isPending) {
    return (
      <DeskCanvas width="full">
        <p className="text-sm text-muted-foreground">{t`Loading pool…`}</p>
      </DeskCanvas>
    );
  }
  if (poolQuery.isError || !pool) {
    return (
      <DeskCanvas width="full">
        <p className="text-sm text-muted-foreground">
          {poolQuery.isError ? t`Couldn't load this pool.` : t`Pool not found.`}
        </p>
      </DeskCanvas>
    );
  }

  const unitSymbol = pool.unitOfAccount ?? pool.symbol;
  const rows = vouchers.map((voucher, index) => ({
    voucher,
    token: voucherTokens[index],
    ratePpm: rates.data?.get(voucher.tokenAddress.toLowerCase()),
  }));
  const columns: DeskColumn<(typeof rows)[number]>[] = [
    {
      id: "voucher",
      header: <Trans>Vouchers</Trans>,
      width: "1.4fr",
      sortValue: (row) => row.voucher.name,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          {row.token ? <TokenLogo token={row.token} size={24} /> : null}
          <span className="truncate font-semibold text-sm">{row.voucher.name}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {row.voucher.symbol}
          </span>
        </span>
      ),
    },
    {
      id: "rate",
      header: <Trans>Rate</Trans>,
      align: "end",
      width: "1fr",
      sortValue: (row) => (row.ratePpm === undefined ? -1 : Number(row.ratePpm)),
      cell: (row) =>
        row.ratePpm === undefined ? null : (
          <span className="font-mono text-xs">
            1 {row.voucher.symbol} ={" "}
            {formatTokenAmount(row.ratePpm.toString(), POOL_PRICE_INDEX_DECIMALS)} {unitSymbol}
          </span>
        ),
    },
  ];

  return (
    <DeskCanvas width="full" className="space-y-4">
      <section className="flex items-start gap-3 border border-border bg-card p-4">
        <PoolLogo imageUrl={pool.imageUrl} name={pool.name} seed={pool.address} size={42} />
        <div className="min-w-0 flex-1">
          <DeskTitle>
            <span className="block truncate">{pool.name}</span>
          </DeskTitle>
          <MultisigOwnerNotice info={ownerInfo.info} />
          {pool.description ? (
            <p dir="auto" className="mt-2 text-sm text-muted-foreground">
              {pool.description}
            </p>
          ) : null}
          {pool.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pool.tags.map((tag) => (
                <Badge key={tag} variant="muted" size="sm">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {pool.active === false ? (
        <div role="status" className="space-y-1 border border-border bg-muted p-3 text-sm">
          <p className="font-semibold">
            <Trans>Retired pool</Trans>
          </p>
          <p>
            <Trans>
              This pool is hidden from discovery and does not accept new swaps or deposits in CLC.
              You can still withdraw funds and view its history.
            </Trans>
          </p>
        </div>
      ) : null}

      {auth.isAuthenticated && pool.active !== false ? (
        <div className="flex flex-wrap gap-2" aria-label={t`Pool actions`}>
          <Button asChild>
            <Link to="/pools/$poolAddress/swap" params={{ poolAddress }}>
              <RiArrowLeftRightLine aria-hidden="true" />
              <Trans>Swap</Trans>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              to="/wallet/send/amount"
              search={{
                recipient: pool.address,
                recipientLabel: pool.name,
                returnPool: pool.address,
              }}
            >
              <RiArrowRightUpLine aria-hidden="true" />
              <Trans>Deposit</Trans>
            </Link>
          </Button>
          <Button variant="info" onClick={() => setReceiving(true)}>
            <RiQrCodeLine aria-hidden="true" />
            <Trans>Receive</Trans>
          </Button>
          <AddToCatalogButton kind="pool" resourceId={pool.id} address={pool.address} />
        </div>
      ) : null}

      {auth.isAuthenticated && pool.active !== false ? (
        <PoolReceiveSheet pool={pool} open={receiving} onClose={() => setReceiving(false)} />
      ) : null}

      {canEditDetails ? (
        <PoolControlsPanel
          pool={pool}
          vouchers={poolVouchers}
          canManageOnChain={canManageOnChain}
          viewerAddress={auth.session?.address}
          privateInfo={
            poolQuery.privateInfo
              ? {
                  ...poolQuery.privateInfo,
                  retry: () => void poolQuery.privateInfo?.refetch(),
                }
              : undefined
          }
        />
      ) : null}

      <div
        className="flex border border-border bg-card"
        role="tablist"
        aria-label={t`Pool contents`}
      >
        {visibleTabs.map((tab) => {
          const selected = selectedTab === tab;
          const className = cn(
            "px-3 py-2 text-sm font-semibold",
            selected ? "bg-foreground text-background" : "text-muted-foreground",
          );
          const label = tabLabel(tab);
          if (selected) {
            return (
              <button
                key={tab}
                type="button"
                id={`pool-tab-${tab}`}
                role="tab"
                aria-selected="true"
                aria-controls={`pool-panel-${tab}`}
                className={className}
              >
                {label}
              </button>
            );
          }
          return (
            <Link
              key={tab}
              id={`pool-tab-${tab}`}
              role="tab"
              aria-selected="false"
              aria-controls={`pool-panel-${tab}`}
              to="/pools/$poolAddress"
              params={{ poolAddress }}
              search={{ tab: tab === "offerings" ? undefined : tab }}
              replace
              resetScroll={false}
              className={className}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {pool.active !== false && selectedTab === "offerings" ? (
        <PoolOfferingsPanel poolAddress={poolAddress} vouchers={vouchers} />
      ) : null}
      {pool.active !== false && selectedTab === "wants" ? (
        <PoolWantsPanel poolAddress={poolAddress} />
      ) : null}
      {pool.active !== false && selectedTab === "vouchers" ? (
        <div
          id="pool-panel-vouchers"
          role="tabpanel"
          aria-labelledby="pool-tab-vouchers"
          className="space-y-3"
        >
          {canManageOnChain ? (
            <Button variant="outline" tap onClick={() => setApproving(true)}>
              <RiAddLine aria-hidden="true" />
              <Trans>Approve voucher</Trans>
            </Button>
          ) : null}
          <div className="relative">
            <DeskTable
              label={t`Vouchers`}
              rows={rows}
              columns={columns}
              rowKey={(row) => row.voucher.tokenAddress.toLowerCase()}
              selectedKey={receive}
              empty={<Trans>No vouchers in this pool yet.</Trans>}
              renderRow={(row, props, cells) => (
                <div className="relative">
                  <Link
                    to="/pools/$poolAddress/swap"
                    params={{ poolAddress }}
                    search={{ receive: row.voucher.tokenAddress.toLowerCase() }}
                    {...props}
                    className={cn(props.className, canManageOnChain && "pe-12")}
                  >
                    {cells}
                  </Link>
                  {canManageOnChain ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t`Manage ${row.voucher.symbol}`}
                      className="absolute end-1 top-0"
                      onClick={() => setManaging(row.voucher)}
                    >
                      <RiSettings3Line aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              )}
            />
          </div>
        </div>
      ) : null}
      {selectedTab === "holdings" ? (
        <PoolHoldingsPanel pool={pool} vouchers={poolVouchers} />
      ) : null}
      {pool.active !== false && selectedTab === "credit" ? (
        <PoolCreditPanel pool={pool} vouchers={vouchers} />
      ) : null}
      {selectedTab === "activity" ? <PoolActivityPanel pool={pool} /> : null}
      {selectedTab === "info" ? (
        <AuthenticatedDetailsGate className="border border-border bg-card p-4">
          <PoolInfo
            pool={pool}
            privateInfo={
              poolQuery.privateInfo
                ? {
                    ...poolQuery.privateInfo,
                    retry: () => void poolQuery.privateInfo?.refetch(),
                  }
                : undefined
            }
          />
        </AuthenticatedDetailsGate>
      ) : null}

      {canManageOnChain ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={poolVouchers}
          voucher={null}
          open={approving}
          onClose={() => setApproving(false)}
        />
      ) : null}
      {canManageOnChain && managing ? (
        <PoolVoucherSheet
          pool={pool}
          poolVouchers={poolVouchers}
          voucher={managing}
          open
          onClose={() => setManaging(null)}
        />
      ) : null}
    </DeskCanvas>
  );
}

function tabLabel(tab: PoolTab): ReactNode {
  switch (tab) {
    case "offerings":
      return <Trans>Offerings</Trans>;
    case "wants":
      return <Trans>Wants</Trans>;
    case "vouchers":
      return <Trans>Vouchers</Trans>;
    case "holdings":
      return <Trans context="Pool tab">Holdings</Trans>;
    case "credit":
      return <Trans>Credit</Trans>;
    case "activity":
      return <Trans>Activity</Trans>;
    case "info":
      return <Trans>Info</Trans>;
  }
}

function PoolInfo({
  pool,
  privateInfo,
}: {
  pool: Parameters<typeof PoolInfoPanel>[0]["pool"];
  privateInfo?: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    retry: () => void;
  };
}) {
  if (privateInfo?.isPending) {
    return (
      <p aria-busy="true" className="text-sm text-muted-foreground">
        <Trans>Loading pool information…</Trans>
      </p>
    );
  }
  if (privateInfo?.isError) {
    return (
      <div role="alert" className="space-y-3 text-sm">
        <p>
          <Trans>Couldn't load pool information.</Trans>
        </p>
        <Button variant="outline" tap pending={privateInfo.isFetching} onClick={privateInfo.retry}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  return <PoolInfoPanel pool={pool} />;
}
