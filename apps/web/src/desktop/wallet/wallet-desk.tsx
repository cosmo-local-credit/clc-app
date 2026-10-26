import { myWantsInfiniteQueryOptions } from "@clc/api/features/wants/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { RiAddLine, RiBankCardLine, RiDownloadLine, RiSendPlane2Line } from "react-icons/ri";

import { ResourceLimitMessage, ResourceQuotaTitle } from "#/components/resource-usage";
import { RESOURCE_HUE, RESOURCE_ICON, RESOURCE_OUTLINE } from "#/components/resource-tone";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { WantPicture } from "#/components/wants/want-row";
import { PoolLogo, TokenLogo, type WalletToken } from "#/components/wallet";
import { activityRowKey } from "#/desktop/activity/activity-desk";
import type { DeskColumn } from "#/desktop/ui/data-table";
import { DeskTable } from "#/desktop/ui/data-table";
import { DeskCanvas, DeskSection, DeskTitle } from "#/desktop/ui/page";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useSafeOwnersSignedBy } from "#/features/ownership/hooks/use-asset-owner-info";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import { useWalletVoucherPreview } from "#/features/wallet/hooks/use-wallet-voucher-preview";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { wantsClient } from "#/lib/api/wants";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { cn } from "#/lib/utils";

export function WalletDesk() {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const address = auth.isAuthenticated ? auth.address : undefined;
  const vouchers = useWalletVoucherPreview(address);
  const usage = useResourceUsage();
  const activityQuery = useAccountActivityInfinite(address, { poll: true });
  const activity = (activityQuery.data?.pages[0]?.activity ?? []).slice(0, 6);
  const wantsQuery = useInfiniteQuery(myWantsInfiniteQueryOptions(wantsClient, address ?? ""));
  const wants = wantsQuery.data?.pages.flatMap((page) => page.wants) ?? [];
  const ownedPoolsQuery = useOwnedPoolsInfinite(address);
  const ownedPoolRows = ownedPoolsQuery.data?.pages.flatMap((page) => page.pools) ?? [];
  const account = address?.toLowerCase();
  const signedSafes = useSafeOwnersSignedBy(
    ownedPoolRows.flatMap((pool) =>
      pool.ownerAddress && pool.ownerAddress.toLowerCase() !== account ? [pool.ownerAddress] : [],
    ),
    address,
  );
  const ownedPools = ownedPoolRows.filter((pool) => {
    const owner = pool.ownerAddress?.toLowerCase();
    return !!owner && (owner === account || signedSafes.has(owner));
  });

  const holdingColumns = useMemo<DeskColumn<WalletToken>[]>(
    () => [
      {
        id: "token",
        header: t`Holdings`,
        sortValue: (row) => row.symbol,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <TokenLogo token={row} size={20} />
            <span className="truncate text-sm font-semibold">{row.symbol}</span>
            <span className="truncate text-xs text-muted-foreground">{row.name}</span>
          </span>
        ),
      },
      {
        id: "balance",
        header: t`Balance`,
        align: "end",
        width: "8rem",
        sortValue: (row) => Number(row.balance ?? 0),
        cell: (row) => (
          <span className="font-heading font-semibold tracking-tight" dir="ltr">
            {row.amount}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <DeskCanvas width="full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <DeskTitle>
            <Trans>Wallet</Trans>
          </DeskTitle>
          {address ? (
            <p className="mt-1 font-mono text-sm text-muted-foreground" dir="ltr">
              {formatVoucherAddress(address)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              <Trans>No wallet address available.</Trans>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/wallet/send">
              <RiSendPlane2Line aria-hidden="true" />
              <Trans>Send</Trans>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/wallet/receive">
              <RiDownloadLine aria-hidden="true" />
              <Trans>Receive</Trans>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/wallet/cash">
              <RiBankCardLine aria-hidden="true" />
              <Trans>Cash</Trans>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/wallet/top-up">
              <RiAddLine aria-hidden="true" />
              <Trans>Top up</Trans>
            </Link>
          </Button>
        </div>
      </div>

      {usage.isError ? (
        <div
          role="alert"
          className="mt-6 flex items-center justify-between gap-3 border border-border bg-card p-4 text-sm"
        >
          <p>
            <Trans>Couldn't load resource limits.</Trans>
          </p>
          <Button
            type="button"
            variant="outline"
            pending={usage.isFetching}
            onClick={() => void usage.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      <div className="mt-6 flex items-start gap-6">
        <DeskSection
          className="min-w-0 flex-1"
          title={<Trans>Holdings</Trans>}
          action={
            <Button asChild variant="ghost">
              <Link to="/wallet/vouchers">
                <Trans>View all</Trans>
              </Link>
            </Button>
          }
        >
          <HoldingsTable
            columns={holdingColumns}
            tokens={vouchers.holdings}
            label={t`Holdings`}
            pending={Boolean(address) && vouchers.isPending}
            error={vouchers.isBalanceError}
            fetching={vouchers.isFetching}
            onRetry={() => void vouchers.refetchBalances()}
          />
        </DeskSection>
        <DeskSection className="w-72 shrink-0" title={<Trans>Activity</Trans>}>
          <RecentActivity
            pending={Boolean(address) && activityQuery.isPending}
            error={activityQuery.isError}
            fetching={activityQuery.isFetching}
            onRetry={() => void activityQuery.refetch()}
            items={activity}
          />
        </DeskSection>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-6">
        <DeskSection
          title={
            <ResourceQuotaTitle
              quota={usage.data?.vouchers}
              pending={usage.isPending}
              error={usage.isError}
            >
              <Trans>My Vouchers</Trans>
            </ResourceQuotaTitle>
          }
          action={
            <Button asChild variant="ghost">
              <Link to="/wallet/vouchers">
                <Trans>View all</Trans>
              </Link>
            </Button>
          }
        >
          {Boolean(address) && vouchers.isPending ? (
            <Loading label={<Trans>Loading vouchers…</Trans>} />
          ) : vouchers.isIssuedError ? (
            <ErrorRetry
              message={<Trans>Couldn't load vouchers.</Trans>}
              pending={vouchers.isFetching}
              onRetry={() => void vouchers.refetchIssued()}
            />
          ) : vouchers.issued.length === 0 ? (
            <EmptyCreate
              message={<Trans>No vouchers yet.</Trans>}
              quota={usage.data?.vouchers}
              blocked={usage.data?.vouchers.canCreate !== true || usage.isError}
              hue={RESOURCE_HUE.vouchers}
              icon={RESOURCE_ICON.vouchers}
              label={<Trans>Create voucher</Trans>}
              to="/vouchers/create/$step"
              params={{ step: "voucher" }}
            />
          ) : (
            <TokenTable tokens={vouchers.issued} label={t`My Vouchers`} />
          )}
        </DeskSection>

        <DeskSection
          title={
            <ResourceQuotaTitle
              quota={usage.data?.pools}
              pending={usage.isPending}
              error={usage.isError}
            >
              <Trans>My Pools</Trans>
            </ResourceQuotaTitle>
          }
          action={
            <Button asChild variant="ghost">
              <Link to="/pools">
                <Trans>All pools</Trans>
              </Link>
            </Button>
          }
        >
          {Boolean(address) && ownedPoolsQuery.isPending ? (
            <Loading label={<Trans>Loading pools…</Trans>} />
          ) : ownedPoolsQuery.isError ? (
            <ErrorRetry
              message={<Trans>Couldn't load your pools.</Trans>}
              pending={ownedPoolsQuery.isFetching}
              onRetry={() => void ownedPoolsQuery.refetch()}
            />
          ) : ownedPools.length === 0 ? (
            <EmptyCreate
              message={<Trans>You haven't created a pool yet.</Trans>}
              quota={usage.data?.pools}
              blocked={usage.data?.pools.canCreate !== true || usage.isError}
              hue={RESOURCE_HUE.pools}
              icon={RESOURCE_ICON.pools}
              label={<Trans>Create pool</Trans>}
              to="/pools/create/$step"
              params={{ step: "pool" }}
            />
          ) : (
            <ul className="border border-border bg-card">
              {ownedPools.map((pool) => (
                <li key={pool.address} className="border-border border-b last:border-b-0">
                  <Link
                    to="/pools/$poolAddress"
                    params={{ poolAddress: pool.address }}
                    className="flex h-10 items-center gap-2 px-3"
                  >
                    <PoolLogo
                      imageUrl={pool.imageUrl}
                      name={pool.name}
                      seed={pool.address}
                      size={20}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {pool.name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {pool.voucherCount === 1 ? (
                        <Trans>1 voucher</Trans>
                      ) : (
                        <Trans>{pool.voucherCount} vouchers</Trans>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {ownedPoolsQuery.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              pending={ownedPoolsQuery.isFetchingNextPage}
              onClick={() => void ownedPoolsQuery.fetchNextPage()}
            >
              <Trans>Load more</Trans>
            </Button>
          ) : null}
        </DeskSection>

        <DeskSection
          title={
            <ResourceQuotaTitle
              quota={usage.data?.wants}
              pending={usage.isPending}
              error={usage.isError}
            >
              <Trans>My Wants</Trans>
            </ResourceQuotaTitle>
          }
          action={
            usage.data?.wants?.canCreate ? (
              <Button asChild variant="ghost">
                <Link to="/wallet/wants/new">
                  <Trans>Create</Trans>
                </Link>
              </Button>
            ) : null
          }
        >
          <ResourceLimitMessage quota={usage.data?.wants} />
          {Boolean(address) && wantsQuery.isPending ? (
            <Loading label={<Trans>Loading Wants…</Trans>} />
          ) : wantsQuery.isError ? (
            <ErrorRetry
              message={<Trans>Couldn't load your Wants.</Trans>}
              pending={wantsQuery.isFetching}
              onRetry={() => void wantsQuery.refetch()}
            />
          ) : wants.length === 0 ? (
            <EmptyCreate
              message={<Trans>No Wants yet.</Trans>}
              quota={undefined}
              blocked={usage.data?.wants.canCreate !== true || usage.isError}
              hue={RESOURCE_HUE.wants}
              icon={RESOURCE_ICON.wants}
              label={<Trans>Create Want</Trans>}
              to="/wallet/wants/new"
            />
          ) : (
            <ul className="border border-border bg-card">
              {wants.map((want) => (
                <li key={want.id} className="border-border border-b last:border-b-0">
                  <Link
                    to="/wallet/wants/$wantId/edit"
                    params={{ wantId: want.id }}
                    className="flex h-10 items-center gap-2 px-3"
                  >
                    <WantPicture want={want} size="size-6" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {want.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {want.state === "scheduled" ? (
                        <Trans>Scheduled</Trans>
                      ) : want.state === "expired" ? (
                        <Trans>Expired</Trans>
                      ) : want.state === "closed" ? (
                        <Trans>Closed</Trans>
                      ) : (
                        <Trans>Active</Trans>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {wantsQuery.hasNextPage ? (
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              pending={wantsQuery.isFetchingNextPage}
              onClick={() => void wantsQuery.fetchNextPage()}
            >
              <Trans>Load more</Trans>
            </Button>
          ) : null}
        </DeskSection>
      </div>
    </DeskCanvas>
  );
}

function HoldingsTable({
  columns,
  tokens,
  label,
  pending,
  error,
  fetching,
  onRetry,
}: {
  columns: DeskColumn<WalletToken>[];
  tokens: readonly WalletToken[];
  label: string;
  pending: boolean;
  error: boolean;
  fetching: boolean;
  onRetry: () => void;
}) {
  if (pending) return <Loading label={<Trans>Loading vouchers…</Trans>} />;
  if (error) {
    return (
      <ErrorRetry
        message={<Trans>Couldn't load vouchers.</Trans>}
        pending={fetching}
        onRetry={onRetry}
      />
    );
  }
  return (
    <DeskTable
      label={label}
      rows={tokens}
      columns={columns}
      rowKey={(row) => row.id}
      empty={<Trans>No vouchers yet.</Trans>}
      renderRow={(row, props, cells) => {
        const voucherAddress = parseVoucherAddress(row.contractAddress ?? row.id);
        return voucherAddress ? (
          <Link
            to="/vouchers/$voucherAddress"
            params={{ voucherAddress }}
            search={{ from: "wallet" }}
            {...props}
          >
            {cells}
          </Link>
        ) : (
          <div {...props}>{cells}</div>
        );
      }}
    />
  );
}

function TokenTable({ tokens, label }: { tokens: readonly WalletToken[]; label: string }) {
  const { t } = useLingui();
  const columns = useMemo<DeskColumn<WalletToken>[]>(
    () => [
      {
        id: "token",
        header: t`Vouchers`,
        sortValue: (row) => row.symbol,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <TokenLogo token={row} size={20} />
            <span className="truncate text-sm font-semibold">{row.symbol}</span>
          </span>
        ),
      },
      {
        id: "balance",
        header: t`Balance`,
        align: "end",
        width: "7rem",
        sortValue: (row) => Number(row.balance ?? 0),
        cell: (row) => (
          <span className="font-heading font-semibold tracking-tight" dir="ltr">
            {row.amount}
          </span>
        ),
      },
    ],
    [t],
  );
  return (
    <DeskTable
      label={label}
      rows={tokens}
      columns={columns}
      rowKey={(row) => row.id}
      empty={<Trans>No vouchers yet.</Trans>}
      renderRow={(row, props, cells) => {
        const voucherAddress = parseVoucherAddress(row.contractAddress ?? row.id);
        return voucherAddress ? (
          <Link
            to="/vouchers/$voucherAddress"
            params={{ voucherAddress }}
            search={{ from: "wallet" }}
            {...props}
          >
            {cells}
          </Link>
        ) : (
          <div {...props}>{cells}</div>
        );
      }}
    />
  );
}

function RecentActivity({
  items,
  pending,
  error,
  fetching,
  onRetry,
}: {
  items: ReadonlyArray<{
    id: number;
    txHash: string;
    kind: string;
    dateBlock: string;
    transfer?: { amount: string; tokenDecimals: number; tokenSymbol: string };
    received?: { amount: string; tokenDecimals: number; tokenSymbol: string };
  }>;
  pending: boolean;
  error: boolean;
  fetching: boolean;
  onRetry: () => void;
}) {
  if (pending) return <Loading label={<Trans>Loading activity…</Trans>} />;
  if (error) {
    return (
      <ErrorRetry
        message={<Trans>Couldn't load activity.</Trans>}
        pending={fetching}
        onRetry={onRetry}
      />
    );
  }
  if (items.length === 0) {
    return (
      <p className="border border-border bg-card px-3 py-8 text-sm text-muted-foreground">
        <Trans>No activity yet.</Trans>
      </p>
    );
  }
  return (
    <ul className="border border-border bg-card">
      {items.map((item) => {
        const leg = item.kind === "swapped" ? item.received : item.transfer;
        return (
          <li key={activityRowKey(item)} className="border-border border-b last:border-b-0">
            <Link
              to="/"
              search={{ tab: "activity", tx: activityRowKey(item) }}
              className="flex h-10 items-center justify-between gap-2 px-3"
            >
              <span className="truncate text-sm font-semibold">
                {item.kind === "creation" ? (
                  <Trans>Created</Trans>
                ) : item.kind === "received" ? (
                  <Trans>Received</Trans>
                ) : item.kind === "swapped" ? (
                  <Trans>Swap</Trans>
                ) : (
                  <Trans>Sent</Trans>
                )}
              </span>
              {leg ? (
                <span className="shrink-0 font-mono text-xs" dir="ltr">
                  {formatTokenAmount(leg.amount, leg.tokenDecimals)} {leg.tokenSymbol}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Loading({ label }: { label: ReactNode }) {
  return (
    <p className="flex items-center gap-2 border border-border bg-card px-3 py-8 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </p>
  );
}

function ErrorRetry({
  message,
  pending,
  onRetry,
}: {
  message: ReactNode;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-2 border border-border bg-card p-4">
      <p role="alert" className="text-sm text-muted-foreground">
        {message}
      </p>
      <Button type="button" variant="outline" pending={pending} onClick={onRetry}>
        <Trans>Try again</Trans>
      </Button>
    </div>
  );
}

function EmptyCreate({
  message,
  quota,
  blocked,
  hue,
  icon: Icon,
  label,
  to,
  params,
}: {
  message: ReactNode;
  quota: Parameters<typeof ResourceLimitMessage>[0]["quota"];
  blocked: boolean;
  hue: string;
  icon: typeof RiAddLine;
  label: ReactNode;
  to: "/vouchers/create/$step" | "/pools/create/$step" | "/wallet/wants/new";
  params?: { step: string };
}) {
  return (
    <div className="space-y-3 border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <ResourceLimitMessage quota={quota} />
      <Button
        asChild={!blocked}
        disabled={blocked}
        variant="outline"
        className={cn("w-full", hue, RESOURCE_OUTLINE)}
      >
        {blocked ? (
          <span>
            <Icon aria-hidden="true" />
            {label}
          </span>
        ) : (
          <Link to={to} params={params}>
            <Icon aria-hidden="true" />
            {label}
          </Link>
        )}
      </Button>
    </div>
  );
}
