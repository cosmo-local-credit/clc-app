import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import {
  POOL_FEE_PERCENT_DECIMALS,
  POOL_PRICE_INDEX_DECIMALS,
} from "@clc/core/features/pool-admin/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AddToCatalogButton } from "#/components/catalogs/add-to-catalog-button";
import { MultisigOwnerNotice } from "#/components/safe/multisig-owner-notice";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { PoolLogo } from "#/components/wallet";
import { PoolInfoDesk } from "#/desktop/pools/detail/pool-info-desk";
import { PoolManageMenu } from "#/desktop/pools/detail/pool-manage-desk";
import { PoolReceivePopover } from "#/desktop/pools/detail/pool-receive-popover";
import type { PoolSide } from "#/desktop/pools/detail/pool-side-panel";
import {
  PoolActivityTable,
  PoolCreditTable,
  PoolHoldingsTable,
  PoolOfferingsGrid,
  PoolVouchersTable,
  PoolWantsTable,
} from "#/desktop/pools/detail/pool-tab-bodies";
import { useDeskTrailLabel } from "#/desktop/trail";
import { DeskStats } from "#/desktop/ui/kv";
import { DeskTitleRow } from "#/desktop/ui/page";
import { DeskTab, DeskTabs } from "#/desktop/ui/tabs";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { usePoolFeeSettings } from "#/features/pools/hooks/use-pool-fee-settings";
import { usePoolHoldings } from "#/features/pools/hooks/use-pool-holdings";
import { usePoolRecentSwaps } from "#/features/pools/hooks/use-pool-recent-swaps";
import { usePoolVouchersWithStatus } from "#/features/pools/hooks/use-pool-vouchers";
import { useUserPoolByAddress } from "#/features/pools/hooks/use-user-pools";

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
export function PoolMain({
  model,
  side,
  onOpenSide,
}: {
  model: LoadedPoolDeskModel;
  /** What the side column shows, so the row it describes reads as selected. */
  side: PoolSide | null;
  onOpenSide: (side: PoolSide) => void;
}) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const { auth, pool, poolAddress, poolVouchers, vouchers, canManageOnChain } = model;
  const requested = usePoolDeskTab() ?? "offerings";
  const receive = usePoolDeskReceive();
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
  const managedVoucher =
    side?.kind === "voucher" ? side.voucher.tokenAddress.toLowerCase() : undefined;

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
            <>
              {canAct ? (
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
                  <PoolReceivePopover pool={pool} />
                  <AddToCatalogButton kind="pool" resourceId={pool.id} address={pool.address} />
                </>
              ) : null}
              {model.canEditDetails ? (
                <PoolManageMenu
                  pool={pool}
                  vouchers={poolVouchers}
                  canManageOnChain={canManageOnChain}
                  viewerAddress={auth.session?.address}
                  onOpen={onOpenSide}
                />
              ) : null}
            </>
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

      <PoolStats
        pool={pool}
        poolVouchers={poolVouchers}
        count={vouchers.length}
        locale={locale}
        showSwaps={auth.isAuthenticated}
      />

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
          <PoolOfferingsGrid poolAddress={poolAddress} vouchers={vouchers} />
        ) : null}
        {!retired && selectedTab === "wants" ? <PoolWantsTable poolAddress={poolAddress} /> : null}
        {!retired && selectedTab === "vouchers" ? (
          <PoolVouchersTable
            pool={pool}
            poolVouchers={poolVouchers}
            vouchers={vouchers}
            selectedKey={managedVoucher ?? receive}
            onManage={
              canManageOnChain ? (voucher) => onOpenSide({ kind: "voucher", voucher }) : undefined
            }
            onApprove={canManageOnChain ? () => onOpenSide({ kind: "approve" }) : undefined}
          />
        ) : null}
        {selectedTab === "holdings" ? (
          <PoolHoldingsTable pool={pool} vouchers={poolVouchers} />
        ) : null}
        {!retired && selectedTab === "credit" ? (
          <PoolCreditTable pool={pool} vouchers={vouchers} />
        ) : null}
        {selectedTab === "activity" ? (
          <PoolActivityTable
            pool={pool}
            selectedKey={side?.kind === "activity" ? side.entry.key : undefined}
            onOpen={(entry) => onOpenSide({ kind: "activity", entry })}
          />
        ) : null}
        {selectedTab === "info" ? (
          <PoolInfoDesk pool={pool} privateInfo={model.privateInfo} />
        ) : null}
      </div>
    </>
  );
}

/** Vouchers, liquidity in the unit of account, and the pool fee — the figures the data has. */
function PoolStats({
  pool,
  poolVouchers,
  count,
  locale,
  showSwaps,
}: {
  pool: UserPool;
  poolVouchers: PoolVoucher[];
  count: number;
  locale: string;
  /** The transfers feed is read behind sign-in, as the Activity tab is. */
  showSwaps: boolean;
}) {
  const { holdings, unit, isPending } = usePoolHoldings(pool, poolVouchers);
  // The fee policy on chain, as the owner's Fee % row reads it; the catalog's copy lags.
  const fee = usePoolFeeSettings(pool, true);
  const swaps = usePoolRecentSwaps(pool.address, showSwaps);
  // Past the page cap the count is a floor, so it says so.
  const swapsValue: ReactNode = swaps.isError ? (
    <span className="text-muted-foreground">—</span>
  ) : swaps.isPending ? (
    <span className="text-muted-foreground">…</span>
  ) : (
    `${swaps.count.toLocaleString(locale)}${swaps.complete ? "" : "+"}`
  );
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
        ...(showSwaps ? [{ label: <Trans>Swaps · 30d</Trans>, value: swapsValue }] : []),
      ]}
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
