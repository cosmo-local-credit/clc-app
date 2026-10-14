import type { AdminPoolTransaction } from "@clc/api/features/admin/client";
import type { Offering } from "@clc/api/features/offerings/client";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { adminPoolTransactionsQueryOptions } from "@clc/api/features/admin/queries";
import { poolOfferingsQueryOptions } from "@clc/api/features/offerings/queries";
import {
  formatOfferingDisplayPrice,
  formatOfferingQuantity,
} from "@clc/core/features/market/logic";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import {
  AddressCell,
  ContractAddress,
  TokenAmount,
  TxLink,
  VoucherCell,
} from "#/components/admin/chain-cells";
import { PoolProtocolFee } from "#/components/admin/pool-protocol-fee";
import { Button } from "#/components/ui/button";
import { PoolPricingPanel } from "./ui/pool-pricing-panel";
import { PoolHoldingsPanel, type PoolVoucherEdit } from "./ui/pool-holdings-panel";
import { usePoolRates } from "./use-pool-pricing";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { RecordPanel } from "#/components/admin/record-panel";
import { SectionState } from "#/components/admin/section-state";
import { StateBadge } from "#/components/admin/state-badge";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import type { DataState } from "#/lib/data-state";
import { clcApi } from "#/lib/api";
import { formatDateTime } from "#/lib/format";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { isModifiedClick } from "#/lib/tab-navigation";
import { useDataState } from "#/lib/use-data-state";
import { cn } from "#/lib/utils";
import { POOL_DETAIL_TABS, type PoolDetailSearch, type PoolDetailTab } from "./pool-detail-search";
import { poolDepositCap } from "@clc/core/features/pools/logic";
import { groupPoolFeeds } from "./pool-posture";
import { hasVoucher, type SettlingVoucher } from "./use-pool-vouchers";

const RECORD_PAGE_SIZE = 25;
const OFFERING_PAGE_SIZE = 100;

const TAB_LABELS: Record<PoolDetailTab, string> = {
  vouchers: "Vouchers",
  holdings: "Holdings",
  credit: "Credit",
  feeds: "Price feeds",
  offerings: "Offerings",
  activity: "Activity",
};

/**
 * The pool's records, one tab per relationship.
 *
 * The open tab is a router search parameter rather than component state, so each
 * tab is linkable and Back returns to the previous one. Base UI's `render` prop
 * makes each tab an actual `<Link>`, which keeps that navigation in the router
 * instead of duplicating it in a click handler.
 *
 * Vouchers and price feeds read the same fetched page — feeds are that page
 * regrouped by the aggregator that prices each row — so both take it as props
 * rather than issuing a second request for data the screen already holds.
 */
export function PoolRecordTabs({
  pool,
  vouchers,
  vouchersState,
  settling,
  search,
  onConfigure,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  vouchersState: DataState;
  /** A signed-for voucher whose catalog row has not appeared yet, if any. */
  settling: SettlingVoucher | null;
  search: PoolDetailSearch;
  onConfigure: (edit: PoolVoucherEdit) => void;
}) {
  const navigate = useNavigate();
  const tab = search.tab;

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        if (next === tab) return;
        void navigate({
          to: "/pools/$address",
          params: { address: pool.address },
          search: { tab: next as PoolDetailTab },
        });
      }}
    >
      <TabsList>
        {POOL_DETAIL_TABS.map((candidate) => (
          <TabsTab
            key={candidate}
            value={candidate}
            nativeButton={false}
            render={
              <Link
                to="/pools/$address"
                params={{ address: pool.address }}
                search={{ tab: candidate }}
                aria-current={candidate === tab ? "page" : undefined}
                onClick={(event) => {
                  if (event.button === 0 && !isModifiedClick(event)) event.preventDefault();
                }}
              />
            }
          >
            {candidate === "feeds" && pool.quoterType !== "oracle"
              ? "Pricing"
              : TAB_LABELS[candidate]}
          </TabsTab>
        ))}
      </TabsList>

      <TabsPanel value={tab} className="border-border bg-card border">
        {tab === "vouchers" ? (
          <VouchersPanel
            pool={pool}
            vouchers={vouchers}
            state={vouchersState}
            settling={settling}
            onConfigure={onConfigure}
          />
        ) : tab === "holdings" || tab === "credit" ? (
          <PoolHoldingsPanel
            pool={pool}
            vouchers={vouchers}
            vouchersState={vouchersState}
            credit={tab === "credit"}
            onConfigure={onConfigure}
          />
        ) : tab === "feeds" ? (
          <FeedsPanel pool={pool} vouchers={vouchers} state={vouchersState} />
        ) : tab === "offerings" ? (
          <OfferingsPanel pool={pool} vouchers={vouchers} />
        ) : (
          <ActivityPanel pool={pool} />
        )}
      </TabsPanel>
    </Tabs>
  );
}

/**
 * Registry membership, deposit headroom and pricing, one row per voucher.
 *
 * There is deliberately no "allowed" column: the endpoint filters on
 * `pool_tokens.is_allowed`, so every row it returns is allowed and a column of
 * identical green chips would spend the table's loudest element on its least
 * informative fact. What does vary is whether a voucher can be deposited and
 * whether it can be priced, and those are the two columns beside the amount.
 */
function VouchersPanel({
  pool,
  vouchers,
  state,
  settling,
  onConfigure,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  state: DataState;
  settling: SettlingVoucher | null;
  onConfigure: (edit: PoolVoucherEdit) => void;
}) {
  // The transaction landed but the row has not. Saying so beats an unchanged
  // table, which reads as the add having silently failed.
  const rates = usePoolRates(
    pool,
    vouchers.map((voucher) => voucher.tokenAddress),
    pool.quoterType === "relative",
  );
  const waiting = settling !== null && !hasVoucher(vouchers, settling.tokenAddress, settling);

  return (
    <RecordPanel state={state}>
      {waiting ? (
        <p className="border-border text-muted-foreground border-b px-4 py-2.5 text-xs">
          Waiting for the indexer to record the voucher change. The transaction has already
          confirmed on chain.
        </p>
      ) : null}

      <SectionState
        state={state}
        errorTitle="Could not load vouchers"
        emptyTitle="No vouchers"
        loadingRows={6}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Deposit cap</TableHead>
                <TableHead>{pool.quoterType === "oracle" ? "Price feed" : "Pricing"}</TableHead>
                <TableHead>Offers</TableHead>
                <TableHead>Synced</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.map((voucher) => (
                <TableRow key={voucher.id}>
                  <TableCell>
                    <VoucherCell
                      address={voucher.tokenAddress}
                      name={voucher.name}
                      symbol={voucher.symbol}
                    />
                  </TableCell>
                  <TableCell>
                    <ContractAddress address={voucher.tokenAddress} label="Copy voucher address" />
                  </TableCell>
                  <TableCell>
                    <DepositCapCell pool={pool} voucher={voucher} />
                  </TableCell>
                  <TableCell>
                    <PricingCell
                      pool={pool}
                      voucher={voucher}
                      rate={rates.data?.[voucher.tokenAddress.toLowerCase()] ?? null}
                    />
                  </TableCell>
                  <TableCell className="font-data text-xs">
                    {voucher.availableOfferCount}/{voucher.offerCount}
                  </TableCell>
                  <TableCell className="font-data text-muted-foreground text-xs">
                    {formatDateTime(voucher.syncedAt)}
                  </TableCell>
                  <TableCell>
                    {pool.quoterType !== "decimal" || pool.limiterAddress !== null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Configure ${voucher.symbol}`}
                        onClick={() =>
                          onConfigure({
                            voucher,
                            ratePpm: rates.data?.[voucher.tokenAddress.toLowerCase()] ?? null,
                            capRaw: voucher.tokenLimit,
                          })
                        }
                      >
                        Configure
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionState>
    </RecordPanel>
  );
}

/**
 * The limiter's recorded cap, in the voucher's own units.
 *
 * The catalog stores `limitOf(token, pool)` as the raw on-chain integer, so it
 * is scaled here rather than printed — an unscaled six-decimal cap reads as a
 * three-hundred-million-token allowance. The three non-numeric outcomes are
 * distinct on purpose: with no limiter nothing is capped, a recorded zero
 * rejects every deposit, and no record at all is neither.
 */
function DepositCapCell({ pool, voucher }: { pool: UserPool; voucher: PoolVoucher }) {
  const cap = poolDepositCap(pool, voucher);

  if (cap.kind === "capped") {
    // No symbol: the voucher column two cells to the left already carries it,
    // and repeating it turns every row into two lines for one number.
    return <TokenAmount amount={cap.raw} decimals={voucher.decimals} />;
  }
  if (cap.kind === "blocked") {
    return <StateBadge state="blocked" kind="deposit" />;
  }
  return (
    <span className="text-muted-foreground font-mono text-xs">
      {cap.kind === "uncapped" ? "Uncapped" : "Not recorded"}
    </span>
  );
}

function PricingCell({
  pool,
  voucher,
  rate,
}: {
  pool: UserPool;
  voucher: PoolVoucher;
  rate: string | null;
}) {
  if (pool.quoterType === "oracle") return <FeedCell voucher={voucher} />;
  if (pool.quoterType === "relative")
    return (
      <TokenAmount
        amount={rate}
        decimals={POOL_PRICE_INDEX_DECIMALS}
        symbol={pool.unitOfAccount ?? pool.symbol}
      />
    );
  return (
    <span className="text-muted-foreground font-mono text-xs">
      {pool.quoterType === "decimal" ? "Equal value" : "Not recorded"}
    </span>
  );
}

function FeedCell({ voucher }: { voucher: PoolVoucher }) {
  if (!voucher.oracleFeedId) {
    return <span className="text-destructive font-mono text-xs">None</span>;
  }

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-sm">{voucher.oracleName ?? "Unnamed feed"}</span>
      <ContractAddress address={voucher.oracleAddress} label="Copy aggregator address" />
    </span>
  );
}

/**
 * The same vouchers, grouped by the aggregator that prices them.
 *
 * A pool's pricing risk is not per voucher but per feed: one aggregator serves
 * several vouchers, and when it goes stale every voucher in its row stops
 * quoting together. Grouping makes that blast radius the thing the operator
 * reads, and puts the vouchers with no feed — the ones an oracle quoter reverts
 * on — in a row of their own.
 */
function FeedsPanel({
  pool,
  vouchers,
  state,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  state: DataState;
}) {
  if (pool.quoterType !== "oracle")
    return <PoolPricingPanel pool={pool} vouchers={vouchers} state={state} />;
  const groups = groupPoolFeeds(vouchers);

  return (
    <>
      {/* The quoter is the contract that turns every row below into a price, so
          it heads the panel rather than sitting in a column that repeats it. */}
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
        <span className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
          Quoter
        </span>
        <ContractAddress address={pool.quoterAddress} label="Copy quoter address" />
      </div>

      <RecordPanel state={state}>
        <SectionState
          state={state}
          errorTitle="Could not load price feeds"
          emptyTitle="No price feeds"
          loadingRows={4}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>Aggregator</TableHead>
                  <TableHead>Vouchers</TableHead>
                  <TableHead>Coverage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.key}>
                    <TableCell>
                      {group.key === "unpriced" ? (
                        <span className="text-destructive font-mono text-xs uppercase">
                          No feed
                        </span>
                      ) : (
                        <span className="text-sm font-medium">{group.name ?? "Unnamed feed"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ContractAddress address={group.address} label="Copy aggregator address" />
                    </TableCell>
                    <TableCell className="font-data text-xs">{group.vouchers.length}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {group.vouchers.map((voucher) => (
                          <Badge key={voucher.id} variant="outline" className="font-mono text-xs">
                            {voucher.symbol}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </RecordPanel>
    </>
  );
}

/**
 * What the pool's vouchers are actually being offered for.
 *
 * The endpoint spans every voucher the pool allows, which is the only place in
 * the console that answers "is this pool trading" with something other than a
 * transaction count.
 */
function OfferingsPanel({ pool, vouchers }: { pool: UserPool; vouchers: PoolVoucher[] }) {
  const query = useQuery(
    poolOfferingsQueryOptions(clcApi.offerings, pool.address, OFFERING_PAGE_SIZE),
  );
  const state = useDataState(query, (page) => page.offerings.length === 0);
  const offerings = query.data?.offerings ?? [];

  return (
    <RecordPanel state={state}>
      <SectionState
        state={state}
        errorTitle="Could not load offerings"
        emptyTitle="No offerings"
        loadingRows={6}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Commodity</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offerings.map((offering) => (
                <OfferingRow
                  key={offering.id}
                  offering={offering}
                  voucher={vouchers.find(
                    (candidate) =>
                      candidate.tokenAddress.toLowerCase() ===
                      offering.voucherAddress.toLowerCase(),
                  )}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionState>
    </RecordPanel>
  );
}

function OfferingRow({ offering, voucher }: { offering: Offering; voucher?: PoolVoucher }) {
  const quantity = formatOfferingQuantity(
    offering.quantity,
    offering.unitLabel,
    offering.sourceId === null,
  );
  const price = formatOfferingDisplayPrice(
    offering.pricePerUnit,
    voucher?.voucherValue ?? null,
    voucher?.voucherUoa ?? null,
    offering.voucherSymbol ?? "",
  );

  return (
    <TableRow>
      <TableCell>
        <span className="block min-w-32 truncate font-medium">{offering.name}</span>
        <span className="text-muted-foreground font-mono text-xs uppercase">
          {offering.commodityType}
        </span>
      </TableCell>
      <TableCell>
        <VoucherCell
          address={offering.voucherAddress}
          name={offering.voucherName ?? undefined}
          symbol={offering.voucherSymbol ?? undefined}
        />
      </TableCell>
      <TableCell>
        <AddressCell address={offering.sellerAddress} />
      </TableCell>
      <TableCell className="font-data text-xs">
        {quantity ? `${quantity.value}${quantity.unit ? ` ${quantity.unit}` : ""}` : "—"}
      </TableCell>
      <TableCell className="font-data text-xs">
        {price
          ? `${price.value} ${price.unit}${offering.unitLabel ? ` / ${offering.unitLabel}` : ""}`
          : "—"}
      </TableCell>
      <TableCell>
        <StateBadge state={offering.available ? "available" : "unavailable"} kind="offering" />
      </TableCell>
    </TableRow>
  );
}

function ActivityPanel({ pool }: { pool: UserPool }) {
  const query = useQuery(
    adminPoolTransactionsQueryOptions(clcApi.admin, {
      perPage: RECORD_PAGE_SIZE,
      pool: pool.address,
    }),
  );
  const state = useDataState(query, (page) => page.transactions.length === 0);
  const transactions = query.data?.transactions ?? [];

  return (
    <>
      <div className="border-border flex items-center justify-end border-b px-4 py-2.5">
        <Link
          to="/transactions/pools"
          search={{ perPage: DEFAULT_PAGE_SIZE, pool: pool.address }}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Open transactions
        </Link>
      </div>

      <RecordPanel state={state}>
        <SectionState
          state={state}
          errorTitle="Could not load activity"
          emptyTitle="No indexed activity"
          loadingRows={6}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Initiator</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Pool fee</TableHead>
                  <TableHead>Protocol fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tx</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <ActivityRow key={transaction.id} transaction={transaction} />
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionState>
      </RecordPanel>
    </>
  );
}

function ActivityRow({ transaction }: { transaction: AdminPoolTransaction }) {
  return (
    <TableRow>
      <TableCell className="font-data text-xs">{formatDateTime(transaction.t)}</TableCell>
      <TableCell className="font-mono text-xs uppercase">{transaction.type}</TableCell>
      <TableCell>
        <AddressCell address={transaction.initiator} />
      </TableCell>
      <TableCell>
        <TokenAmount
          amount={transaction.amountIn}
          decimals={transaction.tokenInDecimals}
          symbol={transaction.tokenInSymbol}
        />
      </TableCell>
      <TableCell>
        <TokenAmount
          amount={transaction.amountOut}
          decimals={transaction.tokenOutDecimals}
          symbol={transaction.tokenOutSymbol}
        />
      </TableCell>
      <TableCell>
        <TokenAmount
          amount={transaction.fee}
          decimals={transaction.tokenOutDecimals}
          symbol={transaction.tokenOutSymbol}
        />
      </TableCell>
      <TableCell>
        <PoolProtocolFee transaction={transaction} />
      </TableCell>
      <TableCell>
        <StateBadge state={transaction.success ? "SUCCESS" : "REVERTED"} kind="pool transaction" />
      </TableCell>
      <TableCell>
        <TxLink txHash={transaction.txHash} />
      </TableCell>
    </TableRow>
  );
}
