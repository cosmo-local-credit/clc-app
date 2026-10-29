import { myWantsInfiniteQueryOptions } from "@clc/api/features/wants/queries";
import type { Want } from "@clc/core/features/wants/logic";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { formatUnitOfAccountDisplayValue } from "@clc/core/features/market/logic";
import { offrampTokenSymbol } from "@clc/core/features/wallet/pretium";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  RiBankCardLine,
  RiDownloadLine,
  RiExchangeDollarLine,
  RiFileCopyLine,
  RiSendPlane2Line,
} from "react-icons/ri";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { WantPicture } from "#/components/wants/want-row";
import { PoolLogo, TokenLogo, type WalletToken } from "#/components/wallet";
import { activityRowKey } from "#/desktop/activity/activity-desk";
import type { DeskColumn } from "#/desktop/ui/data-table";
import { DeskTable } from "#/desktop/ui/data-table";
import {
  DeskCanvas,
  DeskEyebrow,
  DeskRow,
  DeskRowList,
  DeskSection,
  DeskTitle,
  deskSectionLinkClass,
} from "#/desktop/ui/page";
import { DeskChip } from "#/desktop/ui/segment";
import { useElementWidth } from "#/desktop/wallet/use-element-width";
import { WalletCatalogs } from "#/desktop/wallet/wallet-catalogs";
import {
  ActivityAmount,
  ActivityTitle,
  Dash,
  Empty,
  ErrorRetry,
  Loading,
  QuotaMeta,
  SectionActions,
} from "#/desktop/wallet/wallet-parts";
import { WalletProfileAction } from "#/desktop/wallet/wallet-profile-action";
import { WalletRetirements } from "#/desktop/wallet/wallet-retirements";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useSafeOwnersSignedBy } from "#/features/ownership/hooks/use-asset-owner-info";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import { useHoldingPools } from "#/features/wallet/hooks/use-holding-pools";
import { useWalletValuation } from "#/features/wallet/hooks/use-wallet-valuation";
import { useWalletVoucherPreview } from "#/features/wallet/hooks/use-wallet-voucher-preview";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { useResourceUsage } from "#/hooks/use-resource-usage";
import { wantsClient } from "#/lib/api/wants";
import { CHAIN_ID } from "#/lib/chain";
import type { HoldingsFilter } from "#/lib/navigation/home-tabs";
import { parseVoucherAddress } from "#/lib/navigation/voucher-sheet-search";

/**
 * Below this, Holdings folds Pools into the voucher cell instead of giving it a
 * column: the name keeps the room, and the pool is still on the row.
 */
const HOLDINGS_COMPACT_WIDTH = 704;

/**
 * The Wallet tab on a wide screen. The page is two columns until the canvas is
 * 64rem wide, then three: the band spans the row, Holdings is the full row (two
 * of three, with Activity beside it, when there is room), then My Vouchers, My
 * Pools, My Wants, My Catalogs and Retirement requests one column each. Same
 * queries as the phone Wallet.
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
  const navigate = useNavigate({ from: "/" });
  const filter: HoldingsFilter | "all" =
    useSearch({ strict: false, select: (search) => search.holdings }) ?? "all";
  const setFilter = (next: HoldingsFilter | "all") =>
    void navigate({
      to: "/",
      search: (prev) => ({ ...prev, holdings: next === "all" ? undefined : next }),
      replace: true,
    });
  const valuation = useWalletValuation(address);

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
  const holdingPools = useHoldingPools(
    shown.flatMap((token) => {
      const tokenAddress = parseVoucherAddress(token.contractAddress ?? token.id);
      return tokenAddress && !isStable(token) ? [tokenAddress] : [];
    }),
  );
  const unitLabel = valuation.unit;
  const formatValue = (value: string) => formatUnitOfAccountDisplayValue(value, locale) ?? value;

  // Holdings sits in a flexible slot, so its columns follow the room it was
  // given: Pools is its own column while there is room, and folds into the
  // voucher cell once there is not. Unmeasured counts as roomy.
  const [holdingsRef, holdingsWidth] = useElementWidth<HTMLDivElement>();
  const compactHoldings =
    holdingsWidth !== null && holdingsWidth > 0 && holdingsWidth < HOLDINGS_COMPACT_WIDTH;

  const holdingColumns = useMemo<DeskColumn<WalletToken>[]>(() => {
    const poolsCell = (row: WalletToken) => {
      if (row.admin) {
        return (
          <Badge variant="outline" size="sm" caps>
            <Trans>Admin</Trans>
          </Badge>
        );
      }
      const entry = holdingPools.get((row.contractAddress ?? row.id).toLowerCase());
      if (entry === undefined && !isStable(row)) return <Spinner />;
      const first = entry?.pools[0];
      if (!first) return <Dash />;
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <Badge variant="outline" size="sm" className="min-w-0 truncate">
            {first.name}
          </Badge>
          {entry.pools.length > 1 || entry.more ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              +{entry.more ? `${entry.pools.length - 1}+` : entry.pools.length - 1}
            </span>
          ) : null}
        </span>
      );
    };
    const voucher: DeskColumn<WalletToken> = {
      id: "voucher",
      header: t`Voucher`,
      sortValue: (row) => row.name,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-3">
          <TokenLogo token={row} size={28} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{row.name}</span>
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate font-mono" dir="ltr">
                {row.symbol}
              </span>
              {compactHoldings ? poolsCell(row) : null}
            </span>
          </span>
        </span>
      ),
    };
    const pools: DeskColumn<WalletToken> = {
      id: "pools",
      header: t`Pools`,
      width: "10rem",
      cell: poolsCell,
    };
    const balance: DeskColumn<WalletToken> = {
      id: "balance",
      header: t`Balance`,
      align: "end",
      width: "9rem",
      sortValue: (row) => Number(row.balance ?? 0),
      cell: (row) => (
        <span className="font-heading text-base font-semibold tracking-tight" dir="ltr">
          {row.amount}
        </span>
      ),
    };
    const value: DeskColumn<WalletToken> = {
      id: "value",
      header: unitLabel ? t`Value (${unitLabel})` : t`Value`,
      align: "end",
      width: "9rem",
      sortValue: (row) => {
        const priced = valuation.values.get((row.contractAddress ?? row.id).toLowerCase());
        return priced?.status === "priced" ? Number(priced.value) : -1;
      },
      cell: (row) => {
        const priced = valuation.values.get((row.contractAddress ?? row.id).toLowerCase());
        if (priced === undefined || priced.status === "pending") {
          return valuation.isError ? <Dash /> : <Spinner />;
        }
        if (priced.status === "unpriced") return <Dash />;
        return (
          <span className="font-mono text-sm font-semibold" dir="ltr">
            {formatValue(priced.value)}
          </span>
        );
      },
    };
    return compactHoldings ? [voucher, balance, value] : [voucher, pools, balance, value];
  }, [t, holdingPools, valuation, unitLabel, formatValue, compactHoldings]);

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
    <DeskCanvas className="grid-cols-2 @min-[64rem]:grid-cols-3">
      <div className="col-span-full">
        <DeskTitle>
          <Trans>Wallet</Trans>
        </DeskTitle>
      </div>

      <WalletProfileAction address={address} />

      <section
        aria-label={t`Wallet actions`}
        className="col-span-full grid grid-cols-1 gap-4 border border-border bg-card p-5 @min-[64rem]:grid-cols-[minmax(0,1fr)_auto] @min-[64rem]:items-end"
      >
        <div className="grid min-w-0 gap-1">
          <DeskEyebrow>
            <Trans>Total value</Trans>
          </DeskEyebrow>
          <p className="flex min-h-11 min-w-0 flex-wrap items-baseline gap-x-2" aria-live="polite">
            {valuation.isPending ? (
              <Spinner />
            ) : valuation.isError || !unitLabel ? (
              <span className="font-heading text-[2.25rem] leading-tight font-semibold tracking-tight text-muted-foreground">
                —
              </span>
            ) : (
              <>
                <span
                  className="min-w-0 font-heading text-[2.25rem] leading-tight font-semibold tracking-tight [overflow-wrap:anywhere]"
                  dir="ltr"
                >
                  {formatValue(valuation.total)}
                </span>
                <span className="shrink-0 font-mono text-sm font-semibold text-muted-foreground">
                  {unitLabel}
                </span>
              </>
            )}
          </p>
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
        <div className="flex flex-wrap items-center gap-2">
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
            <Link to="/wallet/top-up">
              <RiExchangeDollarLine aria-hidden="true" />
              <Trans>Add / withdraw</Trans>
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/wallet/cash">
              <RiBankCardLine aria-hidden="true" />
              <Trans>Other cash options</Trans>
            </Link>
          </Button>
        </div>
      </section>

      {usage.isError ? (
        <div
          role="alert"
          className="col-span-full flex items-center justify-between gap-3 border border-border bg-card p-4 text-sm"
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
        className="col-span-full @min-[64rem]:col-span-2"
        title={<Trans>Holdings</Trans>}
        action={
          <div className="flex items-center gap-3">
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
            <Link
              to="/wallet/vouchers"
              aria-label={`${t`View all`} ${t`Holdings`}`}
              className={deskSectionLinkClass()}
            >
              <Trans>View all</Trans>
            </Link>
          </div>
        }
      >
        <div ref={holdingsRef} className="min-w-0">
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
              partial={vouchers.isTruncated}
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
        </div>
      </DeskSection>

      <DeskSection
        title={<Trans>Activity</Trans>}
        action={
          <Link
            to="/"
            search={{ tab: "activity" }}
            aria-label={`${t`View all`} ${t`Activity`}`}
            className={deskSectionLinkClass()}
          >
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
            <Link
              to="/wallet/vouchers"
              aria-label={`${t`View all`} ${t`My Vouchers`}`}
              className={deskSectionLinkClass()}
            >
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
                  subtitle={<WantWhen want={want} locale={locale} />}
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

      <WalletCatalogs usage={usage} />

      {address ? <WalletRetirements viewer={address} /> : null}
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

/**
 * When a Want ends, or began. A Want carries its start and its expiry and no
 * closing date (`wantSchema` has no `closedAt`/`updatedAt`), so a closed Want
 * shows its badge alone.
 */
function WantWhen({ want, locale }: { want: Want; locale: string }) {
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(value));
  if (want.state === "closed") return null;
  if (want.state === "scheduled") {
    const starts = date(want.startsAt);
    return <Trans>Starts {starts}</Trans>;
  }
  if (!want.expiresAt) return <Trans>No ending date</Trans>;
  const ends = date(want.expiresAt);
  return want.state === "expired" ? <Trans>Expired {ends}</Trans> : <Trans>Expires {ends}</Trans>;
}
