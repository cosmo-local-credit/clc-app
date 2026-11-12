import type { ActivityKind } from "@clc/api/features/accounts/client";
import type { Offering } from "@clc/api/features/offerings/client";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { poolWantsInfiniteQueryOptions } from "@clc/api/features/wants/queries";
import {
  formatOfferingDisplayPrice,
  formatOfferingDisplayValue,
  formatOfferingPrice,
} from "@clc/core/features/market/logic";
import { formatPoolRate, POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import type { Want } from "@clc/core/features/wants/logic";
import { formatTokenAmount, formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type CSSProperties, type ReactNode, useState } from "react";
import {
  RiAddLine,
  RiArrowLeftDownLine,
  RiArrowLeftRightLine,
  RiArrowRightUpLine,
  RiInformationLine,
  RiSettings3Line,
  RiSparkling2Line,
} from "react-icons/ri";

import {
  SwapActivityAmounts,
  SwapActivityTitle,
  formatActivityLegAmount,
} from "#/components/activity/swap-activity";
import { OfferingDetailsText } from "#/components/offerings/offerings-panel";
import { ManagerClosureNotice } from "#/components/closure/manager-closure-notice";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "#/components/ui/dialog";
import { ProgressiveImage } from "#/components/ui/progressive-image";
import { TagBadge } from "#/components/ui/tag-badge";
import { TokenLogo, EllipsizedAddress, SignedAmount } from "#/components/wallet";
import { WantPicture } from "#/components/wants/want-row";
import type { PoolActivityFeed } from "#/desktop/pools/pool-activity-feed";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskChip } from "#/desktop/ui/segment";
import { usePoolOfferingsInfinite } from "#/features/home/hooks/use-voucher-offerings";
import {
  type AcceptedPoolHolding,
  type PoolVoucherCatalogState,
  usePoolHoldingGroups,
} from "#/features/pools/hooks/use-pool-holding-groups";
import { usePoolHoldings } from "#/features/pools/hooks/use-pool-holdings";
import type { PoolVoucherFeedStatus } from "#/features/pools/hooks/use-pool-quoter";
import type { PoolActivityEntry } from "#/features/pools/logic/pool-activity";
import type { PoolHolding } from "#/features/pools/logic/pool-holdings";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { wantsClient } from "#/lib/api/wants";
import { ACTIVITY_KIND_ORDER } from "#/lib/navigation/activity-search";
import { cn } from "#/lib/utils";

/** Loading, failed and empty states share one line of muted copy on the canvas. */
function TabNotice({
  children,
  retry,
}: {
  children: ReactNode;
  retry?: { pending: boolean; onRetry: () => void };
}) {
  return (
    <div
      role={retry ? "alert" : undefined}
      className="flex min-w-0 items-center justify-between gap-3 border border-border bg-card px-4 py-3.5 text-sm text-muted-foreground"
    >
      <span className="min-w-0">{children}</span>
      {retry ? (
        <Button variant="outline" pending={retry.pending} onClick={retry.onRetry}>
          <Trans>Try again</Trans>
        </Button>
      ) : null}
    </div>
  );
}

function LoadMore({ pending, onLoad }: { pending: boolean; onLoad: () => void }) {
  return (
    <div className="flex justify-center">
      <Button variant="outline" pending={pending} onClick={onLoad}>
        <Trans>Load more</Trans>
      </Button>
    </div>
  );
}

const dash = <span className="text-muted-foreground">—</span>;

function useLocale() {
  const { i18n } = useLingui();
  return i18n.locales?.[0] ?? i18n.locale;
}

function holdingToken(holding: PoolHolding) {
  // The logo and colour derive from the address and symbol alone, so the
  // wallet's mapper serves a pool's balance as well as a holder's.
  return accountTokenToWalletToken({
    id: 0,
    tokenAddress: holding.tokenAddress,
    tokenSymbol: holding.symbol,
    tokenName: holding.name,
    tokenDecimals: holding.decimals ?? 18,
    balance: holding.liquidityRaw ?? "0",
    iconUrl: holding.iconUrl,
    lastDateBlock: "",
  });
}

function VoucherCell({
  logo,
  name,
  symbol,
  managerClosure,
  active,
}: {
  logo: ReactNode;
  name: string;
  symbol: string;
  managerClosure?: PoolVoucher["managerClosure"];
  active?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {logo}
      <span className="min-w-0">
        <span dir="auto" className="block truncate text-sm font-semibold">
          {name}
        </span>
        <ManagerClosureNotice closure={managerClosure} resource="voucher" active={active} compact />
        <span dir="ltr" className="block truncate font-mono text-xs text-muted-foreground">
          {symbol}
        </span>
      </span>
    </span>
  );
}

function Figure({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" className="font-mono font-semibold whitespace-normal">
      {children}
    </span>
  );
}

function sortable(raw: string | null | undefined, decimals: number | null | undefined) {
  return raw && decimals !== null && decimals !== undefined ? Number(raw) / 10 ** decimals : -1;
}

// ---------------------------------------------------------------- Offerings

/** Everything the pool's vouchers offer, as image tiles; each opens its voucher. */
export function PoolOfferingsGrid({
  poolAddress,
  vouchers,
}: {
  poolAddress: string;
  vouchers: PoolVoucher[];
}) {
  const query = usePoolOfferingsInfinite(poolAddress);
  const offerings = query.data?.pages.flatMap((page) => page.offerings) ?? [];
  let body: ReactNode;
  if (query.isPending) {
    body = (
      <TabNotice>
        <Trans>Loading offerings…</Trans>
      </TabNotice>
    );
  } else if (query.isError && offerings.length === 0) {
    body = (
      <TabNotice retry={{ pending: query.isFetching, onRetry: () => void query.refetch() }}>
        <Trans>Couldn't load offerings.</Trans>
      </TabNotice>
    );
  } else if (offerings.length === 0) {
    body = (
      <TabNotice>
        <Trans>No voucher in this pool is offering anything yet.</Trans>
      </TabNotice>
    );
  } else {
    body = (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4">
        {offerings.map((offering) => (
          <OfferingTile
            key={offering.id}
            offering={offering}
            poolAddress={poolAddress}
            rate={vouchers.find(
              (voucher) =>
                voucher.tokenAddress.toLowerCase() === offering.voucherAddress.toLowerCase(),
            )}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {body}
      {query.hasNextPage ? (
        <LoadMore pending={query.isFetchingNextPage} onLoad={() => void query.fetchNextPage()} />
      ) : null}
    </div>
  );
}

function OfferingTile({
  offering,
  poolAddress,
  rate,
}: {
  offering: Offering;
  poolAddress: string;
  rate: PoolVoucher | undefined;
}) {
  const locale = useLocale();
  const { t } = useLingui();
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const candidate = offering.imageUrl ?? offering.voucherImageUrl ?? null;
  const imageUrl = candidate && failed !== candidate ? candidate : null;
  // The price in the pool's terms: the voucher's own conversion where the pool
  // lists it, else the unit-of-account price the catalog computed.
  let price: { value: string; unit: string } | null = null;
  if (formatOfferingPrice(offering.pricePerUnit)) {
    const converted = rate
      ? formatOfferingDisplayPrice(offering.pricePerUnit, rate.voucherValue, rate.voucherUoa, "")
      : offering.priceInUnitOfAccount && offering.voucherUoa
        ? {
            value: formatOfferingPrice(offering.priceInUnitOfAccount)?.value ?? "",
            unit: offering.voucherUoa.trim(),
          }
        : null;
    const value = converted?.value ? formatOfferingDisplayValue(converted.value, locale) : null;
    if (value && converted?.unit) price = { value, unit: converted.unit };
  }
  const initials = offering.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  const image = (
    <span className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-muted">
      {imageUrl ? (
        <ProgressiveImage
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(imageUrl)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-heading text-2xl font-semibold text-muted-foreground"
        >
          {initials}
        </span>
      )}
    </span>
  );
  return (
    <>
      <button
        type="button"
        data-desktop-row=""
        className="flex min-w-0 flex-col border border-border bg-card text-start hover:border-foreground/25"
        aria-label={t`View offering details: ${offering.name}`}
        onClick={() => setOpen(true)}
      >
        {image}
        <span className="grid min-w-0 gap-0.5 p-3">
          <span className="truncate text-xs text-muted-foreground">
            {offering.voucherName ? <span dir="auto">{offering.voucherName}</span> : null}
            {offering.voucherName && offering.voucherSymbol ? " · " : null}
            {offering.voucherSymbol ? (
              <span dir="ltr" className="font-mono">
                {offering.voucherSymbol}
              </span>
            ) : null}
          </span>
          <span dir="auto" className="truncate text-sm font-semibold">
            {offering.name}
          </span>
          {price ? (
            <span dir="ltr" className="truncate text-start font-mono text-xs font-semibold">
              {price.value} {price.unit}
              {offering.unitLabel ? ` / ${offering.unitLabel}` : ""}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              <Trans>Price on request</Trans>
            </span>
          )}
        </span>
      </button>

      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogContent className="grid max-h-[calc(100dvh-3rem)] max-w-lg gap-4 overflow-y-auto rounded-none border border-border bg-card p-5 shadow-none">
            <DialogClose className="sr-only">
              <Trans>Close</Trans>
            </DialogClose>
            <span className="relative grid aspect-[16/7] place-items-center overflow-hidden bg-muted">
              {imageUrl ? (
                <ProgressiveImage
                  src={imageUrl}
                  alt=""
                  onError={() => setFailed(imageUrl)}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="font-heading text-2xl font-semibold text-muted-foreground"
                >
                  {initials}
                </span>
              )}
            </span>
            <OfferingDetailsText
              offering={offering}
              voucherRate={rate ? { value: rate.voucherValue, unit: rate.voucherUoa } : null}
              title={<DialogTitle>{offering.name}</DialogTitle>}
              compact
            />
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <Link
                  to="/vouchers/$voucherAddress"
                  params={{ voucherAddress: offering.voucherAddress }}
                  search={{ poolAddress, tab: "offerings" }}
                  onClick={() => setOpen(false)}
                >
                  <Trans>Open voucher page</Trans>
                </Link>
              </Button>
              <Button asChild>
                <Link
                  to="/pools/$poolAddress/swap"
                  params={{ poolAddress }}
                  search={{ receive: offering.voucherAddress.toLowerCase() }}
                  resetScroll={false}
                  onClick={() => setOpen(false)}
                >
                  <Trans>Swap</Trans>
                </Link>
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
    </>
  );
}

// -------------------------------------------------------------------- Wants

export function PoolWantsTable({ poolAddress }: { poolAddress: string }) {
  const { t } = useLingui();
  const query = useInfiniteQuery(poolWantsInfiniteQueryOptions(wantsClient, poolAddress));
  const wants = query.data?.pages.flatMap((page) => page.wants) ?? [];
  const columns: DeskColumn<Want>[] = [
    {
      id: "want",
      header: <Trans>Want</Trans>,
      width: "minmax(0,1.6fr)",
      sortValue: (want) => want.name,
      cell: (want) => (
        <span className="flex min-w-0 items-center gap-3">
          <WantPicture want={want} size="size-8" />
          <span dir="auto" className="min-w-0 truncate text-sm font-semibold">
            {want.name}
          </span>
        </span>
      ),
    },
    {
      id: "place",
      header: <Trans>Location</Trans>,
      sortValue: (want) => want.locationName ?? "",
      cell: (want) => (
        <span dir="auto" className="text-muted-foreground">
          {want.locationName || "—"}
        </span>
      ),
    },
    {
      id: "tags",
      header: <Trans>Tags</Trans>,
      cell: (want) => (
        <span className="flex gap-1 overflow-hidden">
          {want.state === "scheduled" ? (
            <span className="shrink-0 text-2xs font-semibold text-want-ink">
              <Trans>Scheduled</Trans>
            </span>
          ) : null}
          {want.tags.slice(0, 3).map((tag) => (
            <TagBadge key={tag} tag={tag} size="sm" />
          ))}
        </span>
      ),
    },
  ];
  return (
    <div className="grid gap-4">
      {query.isPending ? (
        <TabNotice>
          <Trans>Loading Wants…</Trans>
        </TabNotice>
      ) : query.isError && !query.data ? (
        <TabNotice retry={{ pending: query.isFetching, onRetry: () => void query.refetch() }}>
          <Trans>Couldn't load Wants for this pool.</Trans>
        </TabNotice>
      ) : (
        <DeskTable
          label={t`Wants`}
          partial={query.hasNextPage}
          rows={wants}
          columns={columns}
          rowKey={(want) => want.id}
          empty={<Trans>No Wants are connected to this pool yet.</Trans>}
          renderRow={(want, props, cells) => (
            <Link
              to="/wants/$wantId"
              params={{ wantId: want.id }}
              search={{ poolAddress }}
              {...props}
            >
              {cells}
            </Link>
          )}
        />
      )}
      {query.hasNextPage ? (
        <LoadMore pending={query.isFetchingNextPage} onLoad={() => void query.fetchNextPage()} />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------- Holdings and credit

function HoldingRowLink({
  poolAddress,
  holding,
  props,
  cells,
}: {
  poolAddress: string;
  holding: PoolHolding;
  props: { className: string; style: CSSProperties; "data-desktop-row": "" };
  cells: ReactNode;
}) {
  return (
    <Link
      to="/vouchers/$voucherAddress"
      params={{ voucherAddress: holding.tokenAddress }}
      search={{ poolAddress }}
      {...props}
    >
      {cells}
    </Link>
  );
}

function holdingStates(
  state: { isPending: boolean; isError: boolean; isFetching: boolean; refetch: () => void },
  messages: { loading: ReactNode; error: ReactNode },
) {
  if (state.isPending) return <TabNotice>{messages.loading}</TabNotice>;
  // Above the rows rather than instead of them: with both chain and indexer
  // down, the catalog can still name what the pool lists.
  if (state.isError) {
    return (
      <TabNotice retry={{ pending: state.isFetching, onRetry: state.refetch }}>
        {messages.error}
      </TabNotice>
    );
  }
  return null;
}

/**
 * An oracle pool's Rate column: the feed each voucher prices from. A row with
 * no catalog voucher behind it (an indexed-only holding) has nothing to show.
 */
function feedColumn<Row>(feedOf: (row: Row) => PoolVoucherFeedStatus | undefined): DeskColumn<Row> {
  return {
    id: "rate",
    header: <Trans>Price feed</Trans>,
    width: "minmax(8rem,1fr)",
    sortValue: (row) => {
      const feed = feedOf(row);
      return feed?.kind === "verified"
        ? feed.label
        : feed?.kind === "unverified"
          ? feed.address
          : "";
    },
    cell: (row) => <FeedCell feed={feedOf(row)} />,
  };
}

function FeedCell({ feed }: { feed: PoolVoucherFeedStatus | undefined }) {
  if (!feed) return dash;
  if (feed.kind === "none") {
    return (
      <Badge variant="muted" size="sm" caps>
        <Trans>No feed</Trans>
      </Badge>
    );
  }
  if (feed.kind === "unverified") {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <EllipsizedAddress address={feed.address} />
        <Badge variant="outline" size="sm" caps>
          <Trans>Unverified</Trans>
        </Badge>
      </span>
    );
  }
  return (
    <span dir="ltr" className="truncate font-mono text-xs">
      {feed.label}
    </span>
  );
}

/** Accepted membership and positive deposits awaiting approval, from authoritative Pool state. */
export function PoolHoldingsTable({
  pool,
  catalog,
  selectedKey,
  onManage,
  onApprove,
}: {
  pool: UserPool;
  catalog: PoolVoucherCatalogState;
  selectedKey?: string;
  onManage?: (voucher: PoolVoucher) => void;
  onApprove?: (candidate?: string) => void;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const state = usePoolHoldingGroups(pool, catalog);
  const canAct = pool.active !== false;
  const unitSymbol = state.unit;
  const acceptedColumns: DeskColumn<AcceptedPoolHolding>[] = [
    {
      id: "voucher",
      header: <Trans>Voucher</Trans>,
      width: "minmax(8rem,1.6fr)",
      sortValue: (row) => row.holding.name,
      cell: ({ holding, voucher }) => (
        <VoucherCell
          logo={<TokenLogo token={holdingToken(holding)} size={28} />}
          name={holding.name}
          symbol={holding.symbol}
          managerClosure={voucher.managerClosure}
          active={voucher.active}
        />
      ),
    },
    {
      id: "in-pool",
      header: <Trans>In pool</Trans>,
      align: "end",
      width: "minmax(7rem,1fr)",
      sortValue: (row) => sortable(row.holding.liquidityRaw, row.holding.decimals),
      cell: ({ holding }) =>
        holding.liquidityRaw === null || holding.decimals === null ? (
          dash
        ) : (
          <Figure>
            {formatTokenAmountFixed(holding.liquidityRaw, holding.decimals, 2, locale)}
          </Figure>
        ),
    },
    state.feeds
      ? feedColumn<AcceptedPoolHolding>((row) => state.feeds?.get(row.holding.tokenAddress))
      : {
          id: "rate",
          header: <Trans>Rate</Trans>,
          align: "end",
          width: "minmax(5.5rem,1fr)",
          sortValue: (row) => sortable(row.holding.ratePpm, POOL_PRICE_INDEX_DECIMALS),
          cell: ({ holding }) =>
            holding.ratePpm === null ? (
              dash
            ) : (
              <Figure>{formatPoolRate(holding.ratePpm, locale)}</Figure>
            ),
        },
    {
      id: "value",
      header: t`Value in ${unitSymbol}`,
      align: "end",
      width: "minmax(8rem,1fr)",
      sortValue: (row) => sortable(row.holding.unitValueRaw, POOL_PRICE_INDEX_DECIMALS),
      cell: ({ holding }) =>
        holding.unitValueRaw === null ? (
          dash
        ) : (
          <Figure>
            {formatTokenAmountFixed(holding.unitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2, locale)}
          </Figure>
        ),
    },
    {
      id: "share",
      header: <Trans>Share</Trans>,
      width: "5rem",
      sortValue: (row) => row.holding.percentOfLargest ?? -1,
      // Measured against the largest holding, not a cap: no track, so the
      // largest bar never reads as a full gauge. Unpriced rows draw nothing.
      cell: ({ holding }) =>
        holding.percentOfLargest === null ? null : (
          <span aria-hidden="true" className="block h-1.5 w-full">
            <span
              className={cn("block h-full bg-info", holding.percentOfLargest > 0 && "min-w-0.5")}
              style={{ width: `${holding.percentOfLargest}%` }}
            />
          </span>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t`Actions`}</span>,
      width: onManage ? "8.5rem" : "6rem",
      cell: () => null,
    },
  ];

  const pendingColumns: DeskColumn<PoolHolding>[] = [
    {
      id: "voucher",
      header: <Trans>Voucher</Trans>,
      width: "minmax(8rem,1.6fr)",
      sortValue: (holding) => holding.name,
      cell: (holding) => (
        <VoucherCell
          logo={<TokenLogo token={holdingToken(holding)} size={28} />}
          name={holding.name}
          symbol={holding.symbol}
        />
      ),
    },
    {
      id: "deposited",
      header: <Trans>Deposited</Trans>,
      align: "end",
      width: "minmax(7rem,1fr)",
      sortValue: (holding) => sortable(holding.balanceRaw, holding.decimals),
      cell: (holding) =>
        holding.decimals === null ? (
          dash
        ) : (
          <Figure>{formatTokenAmount(holding.balanceRaw, holding.decimals, 2)}</Figure>
        ),
    },
    {
      id: "status",
      header: <Trans>Status</Trans>,
      width: "minmax(8rem,1fr)",
      cell: () => (
        <Badge variant="muted" size="sm" caps>
          <Trans>Pending approval</Trans>
        </Badge>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">{t`Actions`}</span>,
      width: onApprove ? "3.5rem" : "0.5rem",
      cell: () => null,
    },
  ];

  return (
    <div className="grid gap-3">
      {canAct && onApprove ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onApprove()}>
            <RiAddLine aria-hidden="true" />
            <Trans>Approve voucher</Trans>
          </Button>
        </div>
      ) : null}
      {holdingStates(state, {
        loading: <Trans>Loading holdings…</Trans>,
        error: <Trans>Couldn't verify all Pool holdings.</Trans>,
      })}
      {state.isPending || !state.verified ? null : (
        <>
          <DeskTable
            label={t`Accepted vouchers`}
            rows={state.accepted}
            columns={acceptedColumns}
            rowKey={(row) => row.holding.tokenAddress}
            selectedKey={selectedKey}
            empty={<Trans>No accepted vouchers in this Pool yet.</Trans>}
            renderRow={(row, props, cells) => (
              <div className="relative">
                <div {...props}>{cells}</div>
                <span className="absolute end-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                  {canAct ? (
                    <Button asChild variant="ghost" size="icon">
                      <Link
                        to="/pools/$poolAddress/swap"
                        params={{ poolAddress: pool.address }}
                        search={{ receive: row.holding.tokenAddress }}
                        resetScroll={false}
                        aria-label={t`Swap for ${row.voucher.symbol}`}
                      >
                        <RiArrowLeftRightLine aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="ghost" size="icon">
                    <Link
                      to="/vouchers/$voucherAddress"
                      params={{ voucherAddress: row.voucher.tokenAddress }}
                      search={{ poolAddress: pool.address }}
                      aria-label={t`Open voucher page`}
                    >
                      <RiInformationLine aria-hidden="true" />
                    </Link>
                  </Button>
                  {canAct && onManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t`Manage ${row.voucher.symbol}`}
                      onClick={() => onManage(row.voucher)}
                    >
                      <RiSettings3Line aria-hidden="true" />
                    </Button>
                  ) : null}
                </span>
              </div>
            )}
          />
          <DeskTable
            label={t`Pending vouchers`}
            rows={state.pending}
            columns={pendingColumns}
            rowKey={(holding) => holding.tokenAddress}
            empty={<Trans>No vouchers are waiting for approval.</Trans>}
            renderRow={(holding, props, cells) => (
              <div className="relative">
                <div {...props}>{cells}</div>
                {canAct && onApprove ? (
                  <span className="absolute end-2.5 top-1/2 -translate-y-1/2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t`Approve ${holding.symbol}`}
                      onClick={() => onApprove(holding.tokenAddress)}
                    >
                      <RiSettings3Line aria-hidden="true" />
                    </Button>
                  </span>
                ) : null}
              </div>
            )}
          />
        </>
      )}
    </div>
  );
}

/**
 * How much more of each voucher the pool will take. The bar fills with what is
 * available, not with what has been used: a fresh limit is all on offer.
 */
export function PoolCreditTable({ pool, vouchers }: { pool: UserPool; vouchers: PoolVoucher[] }) {
  const { t } = useLingui();
  const locale = useLocale();
  const state = usePoolHoldings(pool, vouchers);
  const { holdings, unit } = state;
  const credit = (holding: PoolHolding) => {
    const { cap, decimals, fillPercent, headroomRaw, headroomUnitValueRaw, capUnitValueRaw } =
      holding;
    if (cap.kind !== "capped" || decimals === null || fillPercent === null || headroomRaw === null)
      return null;
    // In the pool's unit where anything prices the voucher, else in the voucher's own units.
    const priced = headroomUnitValueRaw !== null && capUnitValueRaw !== null;
    return {
      available: priced
        ? formatTokenAmountFixed(headroomUnitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2, locale)
        : formatTokenAmountFixed(headroomRaw, decimals, 2, locale),
      limit: priced
        ? formatTokenAmountFixed(capUnitValueRaw, POOL_PRICE_INDEX_DECIMALS, 2, locale)
        : formatTokenAmountFixed(cap.raw, decimals, 2, locale),
      denomination: priced ? unit : holding.symbol,
      percent: 100 - fillPercent,
    };
  };
  const columns: DeskColumn<PoolHolding>[] = [
    {
      id: "voucher",
      header: <Trans>Voucher</Trans>,
      width: "minmax(8rem,1.4fr)",
      sortValue: (holding) => holding.name,
      cell: (holding) => (
        <VoucherCell
          logo={<TokenLogo token={holdingToken(holding)} size={28} />}
          name={holding.name}
          symbol={holding.symbol}
        />
      ),
    },
    {
      id: "limit",
      header: <Trans>Credit limit</Trans>,
      align: "end",
      width: "minmax(9rem,1fr)",
      sortValue: (holding) => sortable(holding.capUnitValueRaw, POOL_PRICE_INDEX_DECIMALS),
      cell: (holding) => {
        const line = credit(holding);
        return line ? (
          <Figure>
            {line.limit} {line.denomination}
          </Figure>
        ) : (
          dash
        );
      },
    },
    {
      id: "available",
      header: <Trans>Available</Trans>,
      align: "end",
      width: "minmax(9rem,1fr)",
      sortValue: (holding) => sortable(holding.headroomUnitValueRaw, POOL_PRICE_INDEX_DECIMALS),
      cell: (holding) => {
        const line = credit(holding);
        if (line) {
          return (
            <Figure>
              {line.available} {line.denomination}
            </Figure>
          );
        }
        // A zero limit says so in words; the two "no limit" cases stay apart.
        return (
          <span className="text-xs text-muted-foreground">
            {holding.cap.kind === "blocked" ? (
              <Trans>No credit offered</Trans>
            ) : holding.cap.kind === "uncapped" ? (
              <Trans>No credit limit</Trans>
            ) : (
              <Trans>Credit limit unknown</Trans>
            )}
          </span>
        );
      },
    },
    {
      id: "bar",
      header: <span className="sr-only">{t`Available credit`}</span>,
      width: "5rem",
      cell: (holding) => {
        const line = credit(holding);
        return line ? (
          <span
            role="progressbar"
            aria-label={t`${holding.name} available credit`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={line.percent}
            className="block h-1.5 w-full bg-muted"
          >
            <span
              className={cn("block h-full bg-primary", line.percent > 0 && "min-w-0.5")}
              style={{ width: `${line.percent}%` }}
            />
          </span>
        ) : null;
      },
    },
  ];
  const loading = state.isPending || state.capsPending;
  return (
    <div className="grid gap-3">
      {holdingStates(
        { ...state, isPending: loading },
        {
          loading: <Trans>Loading credit limits…</Trans>,
          error: <Trans>Couldn't load credit limits.</Trans>,
        },
      )}
      {loading ? null : (
        <DeskTable
          label={t`Pool credit limits`}
          rows={holdings}
          columns={columns}
          rowKey={(holding) => holding.tokenAddress}
          empty={<Trans>No vouchers in this pool yet.</Trans>}
          renderRow={(holding, props, cells) => (
            <HoldingRowLink
              poolAddress={pool.address}
              holding={holding}
              props={props}
              cells={cells}
            />
          )}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Activity

/**
 * Everything that has moved through the pool, of the kinds the filter names; a
 * row opens its details beside the pool. The filter is the phone's sheet as a
 * row of chips: the same kinds in the same order, All clearing them.
 */
export function PoolActivityTable({
  feed,
  selectedKey,
  onOpen,
  types,
  onTypesChange,
}: {
  feed: PoolActivityFeed;
  selectedKey: string | undefined;
  onOpen: (entry: PoolActivityEntry) => void;
  types: readonly ActivityKind[];
  onTypesChange: (types: readonly ActivityKind[]) => void;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const { query, entries } = feed;
  const labels: Record<ActivityKind, string> = {
    creation: t`Creation`,
    sent: t`Sent`,
    received: t`Received`,
    swapped: t`Swapped`,
    deposited: t`Deposits`,
    pool_payout: t`Pay Out`,
  };
  const columns: DeskColumn<PoolActivityEntry>[] = [
    {
      id: "event",
      header: <Trans>Activity</Trans>,
      width: "minmax(8.5rem,1.5fr)",
      cell: (entry) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center bg-muted",
              entry.kind === "swap" || entry.kind === "mint"
                ? "text-foreground"
                : entry.direction === "IN"
                  ? "text-primary"
                  : "text-destructive",
            )}
          >
            <EntryIcon entry={entry} />
          </span>
          <span className="min-w-0 truncate text-sm font-semibold">
            <EntryTitle entry={entry} />
          </span>
          {entry.success ? null : (
            <Badge size="sm" caps variant="muted" className="shrink-0">
              <Trans>Failed</Trans>
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: "party",
      header: <Trans>Counterparty</Trans>,
      width: "7.75rem",
      cell: (entry) =>
        entry.kind === "mint" ? (
          <span className="text-muted-foreground">
            <Trans>New supply</Trans>
          </span>
        ) : (
          <EllipsizedAddress address={entry.counterpartyAddress} />
        ),
    },
    {
      id: "amount",
      header: <Trans>Amount</Trans>,
      align: "end",
      width: "minmax(9rem,1.4fr)",
      cell: (entry) =>
        entry.kind === "swap" ? (
          <span className="grid justify-items-end gap-0.5">
            <SwapActivityAmounts
              incoming={entry.received}
              outgoing={entry.sent}
              protocolFee={entry.protocolFee ?? undefined}
              locale={locale}
              incomingFirst
            />
          </span>
        ) : (
          <SignedAmount
            direction={entry.kind === "mint" || entry.direction === "IN" ? "in" : "out"}
            amount={formatActivityLegAmount(entry.leg, locale)}
          />
        ),
    },
    {
      id: "date",
      header: <Trans>Date</Trans>,
      align: "end",
      width: "9rem",
      sortValue: (entry) => new Date(entry.dateBlock).getTime(),
      cell: (entry) => (
        <time dateTime={entry.dateBlock} className="font-mono text-xs">
          {formatTransferDate(entry.dateBlock, locale)}
        </time>
      ),
    },
  ];
  return (
    <div className="grid gap-4">
      <div role="group" aria-label={t`Filters`} className="flex min-w-0 flex-wrap gap-2">
        <DeskChip on={types.length === 0}>
          <button
            type="button"
            aria-pressed={types.length === 0}
            onClick={() => {
              if (types.length > 0) onTypesChange([]);
            }}
          >
            <Trans>All</Trans>
          </button>
        </DeskChip>
        {ACTIVITY_KIND_ORDER.map((kind) => (
          <DeskChip key={kind} on={types.includes(kind)}>
            <button
              type="button"
              aria-pressed={types.includes(kind)}
              onClick={() =>
                onTypesChange(
                  types.includes(kind)
                    ? types.filter((entry) => entry !== kind)
                    : ACTIVITY_KIND_ORDER.filter(
                        (entry) => entry === kind || types.includes(entry),
                      ),
                )
              }
            >
              {labels[kind]}
            </button>
          </DeskChip>
        ))}
      </div>
      {query.isPending ? (
        <TabNotice>
          <Trans>Loading activity…</Trans>
        </TabNotice>
      ) : query.isError && entries.length === 0 ? (
        <TabNotice retry={{ pending: query.isFetching, onRetry: () => void query.refetch() }}>
          <Trans>Couldn't load activity.</Trans>
        </TabNotice>
      ) : (
        <DeskTable
          label={t`Pool activity`}
          partial={query.hasNextPage}
          rows={entries}
          columns={columns}
          rowKey={(entry) => entry.key}
          selectedKey={selectedKey}
          empty={
            types.length > 0 ? (
              <Trans>No activity matches these filters.</Trans>
            ) : (
              <Trans>Nothing has moved through this pool yet.</Trans>
            )
          }
          // A row opens its details on click or Enter, not on focus: where the
          // page stacks the panel above the list, following focus would pull
          // the person away from the row they are tabbing through.
          renderRow={(entry, props, cells) => (
            <button
              type="button"
              aria-current={selectedKey === entry.key ? "true" : undefined}
              onClick={() => onOpen(entry)}
              {...props}
            >
              {cells}
            </button>
          )}
        />
      )}
      {query.hasNextPage ? (
        <LoadMore pending={query.isFetchingNextPage} onLoad={() => void query.fetchNextPage()} />
      ) : null}
    </div>
  );
}

function EntryIcon({ entry }: { entry: PoolActivityEntry }) {
  if (entry.kind === "swap")
    return <RiArrowLeftRightLine className="size-3.5" aria-hidden="true" />;
  if (entry.kind === "mint") return <RiSparkling2Line className="size-3.5" aria-hidden="true" />;
  const Icon = entry.direction === "IN" ? RiArrowLeftDownLine : RiArrowRightUpLine;
  return <Icon className="size-3.5" aria-hidden="true" />;
}

function EntryTitle({ entry }: { entry: PoolActivityEntry }) {
  if (entry.kind === "swap") {
    return <SwapActivityTitle symbols={[entry.received.tokenSymbol, entry.sent.tokenSymbol]} />;
  }
  if (entry.kind === "mint") return <Trans>Created in the pool</Trans>;
  // A deposit is the only inbound transfer a pool takes; outbound covers a fee
  // sweep and a liquidity withdrawal, which the chain does not tell apart. The
  // phone's words, which the row's details title uses too.
  return entry.direction === "IN" ? <Trans>Deposit</Trans> : <Trans>Pay Out</Trans>;
}
