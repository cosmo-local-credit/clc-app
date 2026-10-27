import type { ResourceKind, ResourceUsage } from "@clc/api/features/resource-limits/client";
import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { myWantsInfiniteQueryOptions } from "@clc/api/features/wants/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { offrampTokenSymbol } from "@clc/core/features/wallet/pretium";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { RiBankCardLine, RiDownloadLine, RiFileCopyLine, RiSendPlane2Line } from "react-icons/ri";
import { toast } from "sonner";

import { SwapActivityTitle } from "#/components/activity/swap-activity";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { WantPicture } from "#/components/wants/want-row";
import { PoolLogo, TokenLogo, type WalletToken } from "#/components/wallet";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { activityRowKey } from "#/desktop/activity/activity-desk";
import type { DeskColumn } from "#/desktop/ui/data-table";
import { DeskTable } from "#/desktop/ui/data-table";
import {
  DeskCanvas,
  DeskRow,
  DeskRowList,
  DeskSection,
  DeskTitle,
  deskSectionLinkClass,
} from "#/desktop/ui/page";
import { DeskChip } from "#/desktop/ui/segment";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useSafeOwnersSignedBy } from "#/features/ownership/hooks/use-asset-owner-info";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import { useWalletVoucherPreview } from "#/features/wallet/hooks/use-wallet-voucher-preview";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { wantsClient } from "#/lib/api/wants";
import { CHAIN_ID } from "#/lib/chain";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";
import { cn } from "#/lib/utils";

type HoldingsFilter = "all" | "vouchers" | "stables";

/**
 * The Wallet tab on a wide screen: one three-column grid. The band spans all
 * three, Holdings two with Activity beside it, then My Vouchers, My Pools and
 * My Wants one column each. Same queries as the phone Wallet.
 */
export function WalletDesk() {
  const { t, i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
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
  const [filter, setFilter] = useState<HoldingsFilter>("all");

  // Everything the account holds: other issuers' vouchers, then its own with a
  // balance, each marked Admin as on the All Vouchers screen.
  const held = useMemo(() => {
    const seen = new Set(vouchers.holdings.map((token) => token.id));
    return [
      ...vouchers.holdings,
      ...vouchers.issued.filter((token) => !seen.has(token.id) && hasBalance(token)),
    ];
  }, [vouchers.holdings, vouchers.issued]);
  const shown = held.filter((token) => {
    if (filter === "all") return true;
    const stable = isStable(token);
    return filter === "stables" ? stable : !stable;
  });

  const holdingColumns = useMemo<DeskColumn<WalletToken>[]>(
    () => [
      {
        id: "voucher",
        header: t`Voucher`,
        sortValue: (row) => row.name,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-3">
            <TokenLogo token={row} size={28} />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold">{row.name}</span>
                {row.admin ? (
                  <Badge variant="outline" size="sm" caps>
                    <Trans>Admin</Trans>
                  </Badge>
                ) : null}
              </span>
              <span className="block truncate font-mono text-xs text-muted-foreground" dir="ltr">
                {row.symbol}
              </span>
            </span>
          </span>
        ),
      },
      {
        id: "balance",
        header: t`Balance`,
        align: "end",
        width: "10rem",
        sortValue: (row) => Number(row.balance ?? 0),
        cell: (row) => (
          <span className="font-heading text-base font-semibold tracking-tight" dir="ltr">
            {row.amount}
          </span>
        ),
      },
    ],
    [t],
  );

  const copyAddress = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy address`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Address copied`))
      .catch(() => toast.error(t`Couldn't copy address`));
  };

  const vouchersCreatable = usage.data?.vouchers.canCreate === true && !usage.isError;
  const wantsCreatable = usage.data?.wants.canCreate === true && !usage.isError;

  return (
    <DeskCanvas className="grid-cols-3">
      <section
        aria-label={t`Wallet actions`}
        className="col-span-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border border-border bg-card p-5"
      >
        <div className="grid min-w-0 gap-1">
          <DeskTitle>
            <Trans>Wallet</Trans>
          </DeskTitle>
          {address ? (
            <button
              type="button"
              aria-label={t`Copy wallet address`}
              className="flex w-fit items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              onClick={() => copyAddress(address)}
            >
              <span dir="ltr">{formatVoucherAddress(address)}</span>
              <RiFileCopyLine className="size-3" aria-hidden="true" />
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">
              <Trans>No wallet address available.</Trans>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
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
              <Trans>Top up</Trans>
            </Link>
          </Button>
        </div>
      </section>

      {usage.isError ? (
        <div
          role="alert"
          className="col-span-3 flex items-center justify-between gap-3 border border-border bg-card p-4 text-sm"
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

      <DeskSection
        className="col-span-2"
        title={<Trans>Holdings</Trans>}
        action={
          <div role="group" aria-label={t`Holdings`} className="flex items-center gap-2">
            {(
              [
                ["all", t`All`],
                ["vouchers", t`Vouchers`],
                ["stables", t`Stables`],
              ] as const
            ).map(([value, label]) => (
              <DeskChip key={value} on={filter === value}>
                <button
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              </DeskChip>
            ))}
          </div>
        }
      >
        {Boolean(address) && vouchers.isPending ? (
          <Loading label={<Trans>Loading vouchers…</Trans>} />
        ) : vouchers.isBalanceError ? (
          <ErrorRetry
            message={<Trans>Couldn't load vouchers.</Trans>}
            pending={vouchers.isFetching}
            onRetry={() => void vouchers.refetchBalances()}
          />
        ) : (
          <DeskTable
            label={t`Holdings`}
            rows={shown}
            columns={holdingColumns}
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
        )}
      </DeskSection>

      <DeskSection
        title={<Trans>Activity</Trans>}
        action={
          <Link to="/" search={{ tab: "activity" }} className={deskSectionLinkClass()}>
            <Trans>View all</Trans>
          </Link>
        }
      >
        {Boolean(address) && activityQuery.isPending ? (
          <Loading label={<Trans>Loading activity…</Trans>} />
        ) : activityQuery.isError ? (
          <ErrorRetry
            message={<Trans>Couldn't load activity.</Trans>}
            pending={activityQuery.isFetching}
            onRetry={() => void activityQuery.refetch()}
          />
        ) : activity.length === 0 ? (
          <Empty>
            <Trans>No activity yet.</Trans>
          </Empty>
        ) : (
          <DeskRowList>
            {activity.map((item) => (
              <Link
                key={activityRowKey(item)}
                to="/"
                search={{ tab: "activity", tx: activityRowKey(item) }}
                className="block hover:bg-muted/60"
              >
                <DeskRow
                  title={<ActivityTitle item={item} />}
                  subtitle={
                    <time className="font-mono" dateTime={item.dateBlock}>
                      {formatTransferDate(item.dateBlock, locale)}
                    </time>
                  }
                  trail={<ActivityAmount item={item} />}
                />
              </Link>
            ))}
          </DeskRowList>
        )}
      </DeskSection>

      <DeskSection
        title={<Trans>My Vouchers</Trans>}
        action={
          <SectionActions>
            <QuotaMeta usage={usage} kind="vouchers" />
            {vouchersCreatable ? (
              <Link
                to="/vouchers/create/$step"
                params={{ step: "voucher" }}
                className={deskSectionLinkClass()}
              >
                <Trans>Create</Trans>
              </Link>
            ) : null}
            <Link to="/wallet/vouchers" className={deskSectionLinkClass()}>
              <Trans>View all</Trans>
            </Link>
          </SectionActions>
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
          <Empty quota={usage.data?.vouchers}>
            <Trans>No vouchers yet.</Trans>
          </Empty>
        ) : (
          <DeskRowList>
            {vouchers.issued.map((token) => {
              const voucherAddress = parseVoucherAddress(token.contractAddress ?? token.id);
              const row = (
                <DeskRow
                  lead={<TokenLogo token={token} size={34} />}
                  title={token.name}
                  subtitle={
                    <span className="font-mono" dir="ltr">
                      {token.symbol}
                    </span>
                  }
                  trail={
                    <span
                      className="shrink-0 font-heading text-sm font-semibold tracking-tight"
                      dir="ltr"
                    >
                      {token.amount}
                    </span>
                  }
                />
              );
              return voucherAddress ? (
                <Link
                  key={token.id}
                  to="/vouchers/$voucherAddress"
                  params={{ voucherAddress }}
                  search={{ from: "wallet" }}
                  className="block hover:bg-muted/60"
                >
                  {row}
                </Link>
              ) : (
                <div key={token.id}>{row}</div>
              );
            })}
          </DeskRowList>
        )}
      </DeskSection>

      <DeskSection
        title={<Trans>My Pools</Trans>}
        action={
          <SectionActions>
            <QuotaMeta usage={usage} kind="pools" />
            {ownedPoolsQuery.isSuccess &&
            ownedPools.length === 0 &&
            usage.data?.pools.canCreate === true &&
            !usage.isError ? (
              <Link
                to="/pools/create/$step"
                params={{ step: "pool" }}
                className={deskSectionLinkClass()}
              >
                <Trans>Create</Trans>
              </Link>
            ) : null}
            <Link to="/pools" className={deskSectionLinkClass()}>
              <Trans>All pools</Trans>
            </Link>
          </SectionActions>
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
          <Empty quota={usage.data?.pools}>
            <Trans>You haven't created a pool yet.</Trans>
          </Empty>
        ) : (
          <DeskRowList>
            {ownedPools.map((pool) => (
              <Link
                key={pool.address}
                to="/pools/$poolAddress"
                params={{ poolAddress: pool.address }}
                className="block hover:bg-muted/60"
              >
                <DeskRow
                  lead={
                    <PoolLogo
                      imageUrl={pool.imageUrl}
                      name={pool.name}
                      seed={pool.address}
                      size={34}
                    />
                  }
                  title={pool.name}
                  subtitle={
                    pool.active === false ? (
                      <Trans>Retired — withdrawals available</Trans>
                    ) : pool.voucherCount === 1 ? (
                      <Trans>1 voucher</Trans>
                    ) : (
                      <Trans>{pool.voucherCount} vouchers</Trans>
                    )
                  }
                />
              </Link>
            ))}
          </DeskRowList>
        )}
        {ownedPoolsQuery.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3 self-start"
            pending={ownedPoolsQuery.isFetchingNextPage}
            onClick={() => void ownedPoolsQuery.fetchNextPage()}
          >
            <Trans>Load more</Trans>
          </Button>
        ) : null}
      </DeskSection>

      <DeskSection
        title={<Trans>My Wants</Trans>}
        action={
          <SectionActions>
            <QuotaMeta usage={usage} kind="wants" />
            {wantsCreatable ? (
              <Link to="/wallet/wants/new" className={deskSectionLinkClass()}>
                <Trans>Create</Trans>
              </Link>
            ) : null}
          </SectionActions>
        }
      >
        {Boolean(address) && wantsQuery.isPending ? (
          <Loading label={<Trans>Loading Wants…</Trans>} />
        ) : wantsQuery.isError ? (
          <ErrorRetry
            message={<Trans>Couldn't load your Wants.</Trans>}
            pending={wantsQuery.isFetching}
            onRetry={() => void wantsQuery.refetch()}
          />
        ) : wants.length === 0 ? (
          <Empty quota={usage.data?.wants}>
            <Trans>No Wants yet.</Trans>
          </Empty>
        ) : (
          <DeskRowList>
            {wants.map((want) => (
              <Link
                key={want.id}
                to="/wallet/wants/$wantId/edit"
                params={{ wantId: want.id }}
                className="block hover:bg-muted/60"
              >
                <DeskRow
                  lead={<WantPicture want={want} />}
                  title={want.name}
                  trail={
                    <Badge variant={want.state === "active" ? "primary" : "outline"} size="sm" caps>
                      {want.state === "scheduled" ? (
                        <Trans>Scheduled</Trans>
                      ) : want.state === "expired" ? (
                        <Trans>Expired</Trans>
                      ) : want.state === "closed" ? (
                        <Trans>Closed</Trans>
                      ) : (
                        <Trans>Active</Trans>
                      )}
                    </Badge>
                  }
                />
              </Link>
            ))}
          </DeskRowList>
        )}
        {wantsQuery.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3 self-start"
            pending={wantsQuery.isFetchingNextPage}
            onClick={() => void wantsQuery.fetchNextPage()}
          >
            <Trans>Load more</Trans>
          </Button>
        ) : null}
      </DeskSection>
    </DeskCanvas>
  );
}

function hasBalance(token: WalletToken): boolean {
  try {
    return BigInt(token.balance ?? "0") > 0n;
  } catch {
    return false;
  }
}

function isStable(token: WalletToken): boolean {
  return offrampTokenSymbol(CHAIN_ID, token.contractAddress ?? token.id) !== null;
}

function ActivityTitle({ item }: { item: AccountActivityItem }) {
  if (item.kind === "swapped") {
    return <SwapActivityTitle symbols={[item.received.tokenSymbol, item.sent.tokenSymbol]} />;
  }
  if (item.kind === "creation") return <Trans>Created</Trans>;
  return <RecipientIdentityLabel address={item.counterpartyAddress} />;
}

function ActivityAmount({ item }: { item: AccountActivityItem }) {
  const leg = item.kind === "swapped" ? item.received : item.transfer;
  const incoming = item.kind !== "sent";
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-xs font-semibold",
        incoming && item.kind !== "creation" && "text-success-ink",
      )}
      dir="ltr"
    >
      {item.kind === "creation" ? "" : incoming ? "+" : "−"}
      {formatTokenAmount(leg.amount, leg.tokenDecimals)}{" "}
      <span className="text-2xs text-muted-foreground">{leg.tokenSymbol}</span>
    </span>
  );
}

function SectionActions({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-3">{children}</div>;
}

/** "1 of 3 used", muted: the phone's count, set as section meta. */
function QuotaMeta({
  usage,
  kind,
}: {
  usage: ReturnType<typeof useResourceUsage>;
  kind: ResourceKind;
}) {
  const { i18n } = useLingui();
  const quota: ResourceUsage[ResourceKind] | undefined = usage.data?.[kind];
  if (usage.isError || !quota) return null;
  const digits = new Intl.NumberFormat(i18n.locales?.[0] ?? i18n.locale);
  const used = digits.format(quota.used);
  const limit = digits.format(quota.limit);
  return (
    <span className="text-xs whitespace-nowrap text-muted-foreground" aria-live="polite">
      {quota.unlimited ? (
        <Trans id="{used} used · Unlimited">{used} used · Unlimited</Trans>
      ) : (
        <Trans id="{used} of {limit} used">
          {used} of {limit} used
        </Trans>
      )}
    </span>
  );
}

function Loading({ label }: { label: ReactNode }) {
  return (
    <p className="flex items-center gap-2 border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </p>
  );
}

function Empty({ children, quota }: { children: ReactNode; quota?: ResourceUsage[ResourceKind] }) {
  return (
    <div className="grid gap-1 border border-border bg-card px-4 py-6">
      <p className="text-sm text-muted-foreground">{children}</p>
      {quota && !quota.canCreate ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Limit reached. Ask an administrator to increase your allowance.</Trans>
        </p>
      ) : null}
    </div>
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
    <div className="grid justify-items-start gap-2 border border-border bg-card p-4">
      <p role="alert" className="text-sm text-muted-foreground">
        {message}
      </p>
      <Button type="button" variant="outline" pending={pending} onClick={onRetry}>
        <Trans>Try again</Trans>
      </Button>
    </div>
  );
}
