import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  POOL_FEE_PERCENT_DECIMALS,
  POOL_PRICE_INDEX_DECIMALS,
} from "@clc/core/features/pool-admin/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useSearch } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { RiAddLine, RiSettings3Line } from "react-icons/ri";

import { AuthenticatedDetailsGate } from "#/components/auth/authenticated-details-gate";
import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { MultisigOwnerNotice } from "#/components/safe/multisig-owner-notice";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { PoolLogo, TokenLogo } from "#/components/wallet";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskStats } from "#/desktop/ui/kv";
import { DeskSection, DeskTitleRow } from "#/desktop/ui/page";
import { DeskTab, DeskTabs } from "#/desktop/ui/tabs";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { usePoolFeeSettings } from "#/features/pools/hooks/use-pool-fee-settings";
import { usePoolHoldings } from "#/features/pools/hooks/use-pool-holdings";
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

/** Everything the pool page reads once and shares between its main and side columns. */
export function usePoolDeskModel(poolAddress: string) {
  const auth = useAuthStatus();
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
  const canEditDetails =
    auth.isAuthenticated && !!pool && (auth.session?.role === "SUPERADMIN" || isPoolOwner);
  const privateInfo = poolQuery.privateInfo
    ? { ...poolQuery.privateInfo, retry: () => void poolQuery.privateInfo?.refetch() }
    : undefined;
  return {
    poolAddress,
    auth,
    poolQuery,
    pool,
    ownerInfo,
    poolVouchers,
    vouchers: poolVouchers.filter((voucher) => voucher.active),
    canEditDetails,
    canManageOnChain: isPoolOwner,
    privateInfo,
  };
}

type PoolDeskModel = ReturnType<typeof usePoolDeskModel>;
type LoadedPoolDeskModel = PoolDeskModel & { pool: UserPool };

/** The pool's header, figures, owner tools and tabs: the main column of the pool page. */
export function PoolMain({ model }: { model: LoadedPoolDeskModel }) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const { auth, pool, poolAddress, poolVouchers, vouchers, canManageOnChain } = model;
  const requested = usePoolDeskTab() ?? "offerings";
  const receive = usePoolDeskReceive();
  const [managing, setManaging] = useState<PoolVoucher | null>(null);
  const [approving, setApproving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const retired = pool.active === false;
  const selectedTab =
    retired && requested !== "activity" && requested !== "info" ? "holdings" : requested;
  const visibleTabs = retired
    ? POOL_TABS.filter((tab) => tab === "holdings" || tab === "activity" || tab === "info")
    : auth.isAuthenticated
      ? POOL_TABS
      : POOL_TABS.filter(
          (tab) => tab === "offerings" || tab === "wants" || tab === "vouchers" || tab === "info",
        );
  const canAct = auth.isAuthenticated && !retired;

  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <PoolLogo
          imageUrl={pool.imageUrl}
          name={pool.name}
          seed={pool.address}
          size={56}
          className="rounded-none"
        />
        <DeskTitleRow
          className="min-w-0 flex-1"
          title={<span className="block truncate">{pool.name}</span>}
          meta={
            <span className="flex min-w-0 items-center gap-1">
              {pool.locationName ? (
                <>
                  <span dir="auto" className="min-w-0 truncate">
                    {pool.locationName}
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span dir="ltr" className="shrink-0 font-mono">
                {formatVoucherAddress(pool.address)}
              </span>
            </span>
          }
          actions={
            canAct ? (
              <>
                <Button asChild variant="outline">
                  <Link
                    to="/wallet/send/amount"
                    search={{
                      recipient: pool.address,
                      recipientLabel: pool.name,
                      returnPool: pool.address,
                    }}
                  >
                    <Trans>Deposit</Trans>
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setReceiving(true)}>
                  <Trans>Receive</Trans>
                </Button>
                <AddToCatalogButton kind="pool" resourceId={pool.id} address={pool.address} />
              </>
            ) : null
          }
        />
      </div>

      {model.ownerInfo.info?.kind === "safe" || pool.tags.length > 0 ? (
        <div className="-mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <MultisigOwnerNotice info={model.ownerInfo.info} />
          {pool.tags.map((tag) => (
            <Badge key={tag} variant="muted" size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {retired ? (
        <div role="status" className="space-y-1 border border-border bg-card p-4 text-sm">
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

      <PoolStats pool={pool} poolVouchers={poolVouchers} count={vouchers.length} locale={locale} />

      {model.canEditDetails ? (
        <DeskSection title={<Trans>Manage</Trans>}>
          <PoolControlsPanel
            pool={pool}
            vouchers={poolVouchers}
            canManageOnChain={canManageOnChain}
            viewerAddress={auth.session?.address}
            privateInfo={model.privateInfo}
          />
        </DeskSection>
      ) : null}

      <div className="grid min-w-0 gap-4">
        <DeskTabs label={t`Pool contents`}>
          {visibleTabs.map((tab) => (
            <DeskTab key={tab} active={selectedTab === tab}>
              {selectedTab === tab ? (
                <button type="button" id={`pool-tab-${tab}`}>
                  {tabLabel(tab)}
                </button>
              ) : (
                <Link
                  id={`pool-tab-${tab}`}
                  to="/pools/$poolAddress"
                  params={{ poolAddress }}
                  search={{ tab: tab === "offerings" ? undefined : tab }}
                  replace
                  resetScroll={false}
                >
                  {tabLabel(tab)}
                </Link>
              )}
            </DeskTab>
          ))}
        </DeskTabs>

        {!retired && selectedTab === "offerings" ? (
          <PoolOfferingsPanel poolAddress={poolAddress} vouchers={vouchers} />
        ) : null}
        {!retired && selectedTab === "wants" ? <PoolWantsPanel poolAddress={poolAddress} /> : null}
        {!retired && selectedTab === "vouchers" ? (
          <div
            id="pool-panel-vouchers"
            role="tabpanel"
            aria-labelledby="pool-tab-vouchers"
            className="grid gap-3"
          >
            {canManageOnChain ? (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setApproving(true)}>
                  <RiAddLine aria-hidden="true" />
                  <Trans>Approve voucher</Trans>
                </Button>
              </div>
            ) : null}
            <PoolVoucherTable
              pool={pool}
              poolVouchers={poolVouchers}
              vouchers={vouchers}
              selectedKey={receive}
              locale={locale}
              onManage={canManageOnChain ? setManaging : undefined}
            />
          </div>
        ) : null}
        {selectedTab === "holdings" ? (
          <PoolHoldingsPanel pool={pool} vouchers={poolVouchers} />
        ) : null}
        {!retired && selectedTab === "credit" ? (
          <PoolCreditPanel pool={pool} vouchers={vouchers} />
        ) : null}
        {selectedTab === "activity" ? <PoolActivityPanel pool={pool} /> : null}
        {selectedTab === "info" ? (
          <AuthenticatedDetailsGate className="border border-border bg-card p-4">
            <PoolInfo pool={pool} privateInfo={model.privateInfo} />
          </AuthenticatedDetailsGate>
        ) : null}
      </div>

      {canAct ? (
        <PoolReceiveSheet pool={pool} open={receiving} onClose={() => setReceiving(false)} />
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
    </>
  );
}

/** Vouchers, liquidity in the unit of account, and the pool fee — the figures the data has. */
function PoolStats({
  pool,
  poolVouchers,
  count,
  locale,
}: {
  pool: UserPool;
  poolVouchers: PoolVoucher[];
  count: number;
  locale: string;
}) {
  const { holdings, unit, isPending } = usePoolHoldings(pool, poolVouchers);
  // The fee policy on chain, as the owner's Fee % row reads it; the catalog's copy lags.
  const fee = usePoolFeeSettings(pool, true);
  let liquidity: ReactNode = null;
  if (isPending) {
    liquidity = <span className="text-muted-foreground">…</span>;
  } else if (holdings.length > 0 && holdings.every((holding) => holding.unitValueRaw !== null)) {
    const total = holdings.reduce((sum, holding) => sum + BigInt(holding.unitValueRaw ?? "0"), 0n);
    liquidity = formatTokenAmountFixed(total.toString(), POOL_PRICE_INDEX_DECIMALS, 2, locale);
  }
  return (
    <DeskStats
      items={[
        { label: <Trans>Vouchers</Trans>, value: count.toLocaleString(locale) },
        ...(liquidity
          ? [
              {
                label: <Trans>Liquidity</Trans>,
                value: liquidity,
                detail: <span className="font-mono">{unit}</span>,
              },
            ]
          : []),
        ...(fee.data || fee.isLoading
          ? [
              {
                label: <Trans>Pool fee</Trans>,
                value: fee.data ? (
                  `${formatTokenAmountFixed(fee.data.feePpm, POOL_FEE_PERCENT_DECIMALS, 2, locale)}%`
                ) : (
                  <span className="text-muted-foreground">…</span>
                ),
              },
            ]
          : []),
        ...(pool.unitOfAccount
          ? [{ label: <Trans>Unit of account</Trans>, value: pool.unitOfAccount }]
          : []),
      ]}
    />
  );
}

function PoolVoucherTable({
  pool,
  poolVouchers,
  vouchers,
  selectedKey,
  locale,
  onManage,
}: {
  pool: UserPool;
  poolVouchers: PoolVoucher[];
  vouchers: PoolVoucher[];
  selectedKey: string | undefined;
  locale: string;
  onManage?: (voucher: PoolVoucher) => void;
}) {
  const { t } = useLingui();
  const voucherTokens = usePoolVoucherTokens(vouchers);
  const { holdings, isPending } = usePoolHoldings(pool, poolVouchers);
  const byAddress = new Map(holdings.map((holding) => [holding.tokenAddress, holding]));
  const rows = vouchers.map((voucher, index) => ({
    voucher,
    token: voucherTokens[index],
    holding: byAddress.get(voucher.tokenAddress.toLowerCase()),
  }));
  type Row = (typeof rows)[number];
  const pending = <span className="text-muted-foreground">…</span>;
  const dash = <span className="text-muted-foreground">—</span>;
  const figure = (raw: string | null | undefined, decimals: number | null) =>
    raw === null || raw === undefined || decimals === null ? (
      isPending ? (
        pending
      ) : (
        dash
      )
    ) : (
      <span dir="ltr" className="font-mono font-semibold">
        {formatTokenAmountFixed(raw, decimals, 2, locale)}
      </span>
    );
  const limitRaw = (row: Row) => {
    const cap = row.holding?.cap;
    if (cap?.kind === "capped") return cap.raw;
    if (cap?.kind === "blocked") return "0";
    return null;
  };
  const sortable = (raw: string | null | undefined, decimals: number | null | undefined) =>
    raw && decimals !== null && decimals !== undefined ? Number(raw) / 10 ** decimals : -1;
  const columns: DeskColumn<Row>[] = [
    {
      id: "voucher",
      header: <Trans>Voucher</Trans>,
      width: "minmax(0,1.8fr)",
      sortValue: (row) => row.voucher.name,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-3">
          {row.token ? <TokenLogo token={row.token} size={28} /> : null}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{row.voucher.name}</span>
            <span dir="ltr" className="block truncate font-mono text-xs text-muted-foreground">
              {row.voucher.symbol}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: "in-pool",
      header: <Trans>In pool</Trans>,
      align: "end",
      sortValue: (row) => sortable(row.holding?.liquidityRaw, row.holding?.decimals),
      cell: (row) => figure(row.holding?.liquidityRaw, row.holding?.decimals ?? null),
    },
    {
      id: "limit",
      header: <Trans>Limit</Trans>,
      align: "end",
      sortValue: (row) => sortable(limitRaw(row), row.holding?.decimals),
      cell: (row) => figure(limitRaw(row), row.holding?.decimals ?? null),
    },
    {
      id: "rate",
      header: <Trans>Rate</Trans>,
      align: "end",
      sortValue: (row) => sortable(row.holding?.ratePpm, POOL_PRICE_INDEX_DECIMALS),
      cell: (row) => figure(row.holding?.ratePpm, POOL_PRICE_INDEX_DECIMALS),
    },
  ];

  return (
    <DeskTable
      label={t`Vouchers`}
      rows={rows}
      columns={columns}
      rowKey={(row) => row.voucher.tokenAddress.toLowerCase()}
      selectedKey={selectedKey}
      empty={<Trans>No vouchers in this pool yet.</Trans>}
      renderRow={(row, props, cells) => (
        <div className="relative">
          <Link
            to="/pools/$poolAddress/swap"
            params={{ poolAddress: pool.address }}
            search={{ receive: row.voucher.tokenAddress.toLowerCase() }}
            resetScroll={false}
            {...props}
            className={cn(props.className, onManage && "pe-12")}
          >
            {cells}
          </Link>
          {onManage ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t`Manage ${row.voucher.symbol}`}
              className="absolute end-2 top-1/2 -translate-y-1/2"
              onClick={() => onManage(row.voucher)}
            >
              <RiSettings3Line aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      )}
    />
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
  pool: UserPool;
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
