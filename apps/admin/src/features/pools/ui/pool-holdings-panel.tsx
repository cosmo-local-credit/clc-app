import { accountTokensInfiniteQueryOptions } from "@clc/api/features/accounts/queries";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { buildPoolHoldings, type PoolHolding } from "@clc/core/features/pools/holdings";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { TokenAmount, VoucherCell } from "#/components/admin/chain-cells";
import { DataTable } from "#/components/admin/data-table";
import { RecordPanel } from "#/components/admin/record-panel";
import { SectionState } from "#/components/admin/section-state";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";
import type { DataState } from "#/lib/data-state";
import { useDataState } from "#/lib/use-data-state";
import { usePoolRates } from "../use-pool-pricing";
import { usePoolTreasury } from "../use-pool-treasury";

export type PoolVoucherEdit = {
  voucher: PoolVoucher;
  ratePpm: string | null;
  capRaw: string | null;
};

/** Balances and credit always read in voucher units, regardless of quoter. */
export function PoolHoldingsPanel({
  pool,
  vouchers,
  vouchersState,
  credit,
  onConfigure,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  vouchersState: DataState;
  credit: boolean;
  onConfigure: (edit: PoolVoucherEdit) => void;
}) {
  const indexed = useInfiniteQuery({
    ...accountTokensInfiniteQueryOptions(clcApi.accounts, pool.address, 100),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const tokens = indexed.data?.pages.flatMap((page) => page.tokens);
  const addresses = [
    ...vouchers.map((voucher) => voucher.tokenAddress),
    ...(tokens ?? []).map((token) => token.tokenAddress),
  ];
  const treasury = usePoolTreasury(pool, addresses, true);
  const rates = usePoolRates(pool, addresses, pool.quoterType === "relative");
  const holdings = buildPoolHoldings({
    pool,
    vouchers,
    treasury: treasury.data,
    indexedTokens: tokens,
    rates: new Map(
      Object.entries(rates.data ?? {}).flatMap(([address, rate]) =>
        rate === null ? [] : [[address, BigInt(rate)]],
      ),
    ),
    priced: pool.quoterType === "relative",
    requireRates: true,
  });
  const indexedState = useDataState(indexed, () => holdings.length === 0);
  const treasuryState = useDataState(treasury, () => false);
  let state: DataState =
    addresses.length > 0 && indexedState.kind !== "pending" && treasuryState.kind === "pending"
      ? treasuryState
      : indexedState;
  if (indexedState.kind === "error" && treasury.data && holdings.length > 0)
    state = { kind: "stale", message: "Additional indexed holdings could not be loaded." };
  if (holdings.length === 0 && (vouchersState.kind === "pending" || vouchersState.kind === "error"))
    state = vouchersState;
  const knownBalances = new Set([
    ...(tokens ?? []).map((token) => token.tokenAddress.toLowerCase()),
    ...(treasury.data?.keys() ?? []),
  ]);
  const columns = (
    [
      {
        id: "voucher",
        header: "Voucher",
        cell: ({ row }) => (
          <VoucherCell
            address={row.original.tokenAddress}
            name={row.original.name}
            symbol={row.original.symbol}
          />
        ),
      },
      {
        id: "balance",
        header: "Balance",
        meta: { align: "right" },
        cell: ({ row }) => (
          <TokenAmount
            amount={knownBalances.has(row.original.tokenAddress) ? row.original.balanceRaw : null}
            decimals={row.original.decimals}
          />
        ),
      },
      ...(credit
        ? [
            {
              id: "limit",
              header: "Credit limit",
              meta: { align: "right" as const },
              cell: ({ row }: { row: { original: PoolHolding } }) => (
                <CreditCap holding={row.original} />
              ),
            },
            {
              id: "headroom",
              header: "Available credit",
              meta: { align: "right" as const },
              cell: ({ row }: { row: { original: PoolHolding } }) => (
                <TokenAmount
                  amount={
                    knownBalances.has(row.original.tokenAddress)
                      ? row.original.cap.kind === "blocked"
                        ? "0"
                        : row.original.headroomRaw
                      : null
                  }
                  decimals={row.original.decimals}
                />
              ),
            },
          ]
        : [
            {
              id: "liquidity",
              header: "Available liquidity",
              meta: { align: "right" as const },
              cell: ({ row }: { row: { original: PoolHolding } }) => (
                <TokenAmount amount={row.original.liquidityRaw} decimals={row.original.decimals} />
              ),
            },
            {
              id: "fees",
              header: "Accrued pool fees",
              meta: { align: "right" as const },
              cell: ({ row }: { row: { original: PoolHolding } }) => (
                <TokenAmount amount={row.original.feesRaw} decimals={row.original.decimals} />
              ),
            },
          ]),
      ...(pool.quoterType === "relative"
        ? [
            {
              id: "value",
              header: `${credit ? "Available credit" : "Liquidity"} (${pool.unitOfAccount ?? pool.symbol})`,
              meta: { align: "right" as const },
              cell: ({ row }: { row: { original: PoolHolding } }) => (
                <TokenAmount
                  amount={
                    credit
                      ? knownBalances.has(row.original.tokenAddress)
                        ? row.original.headroomUnitValueRaw
                        : null
                      : row.original.unitValueRaw
                  }
                  decimals={POOL_PRICE_INDEX_DECIMALS}
                />
              ),
            },
          ]
        : []),
      {
        id: "catalog",
        header: "Registry",
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.uncatalogued ? "Not catalogued" : "Listed"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const voucher = vouchers.find(
            (candidate) => candidate.tokenAddress.toLowerCase() === row.original.tokenAddress,
          );
          return voucher && (pool.quoterType !== "decimal" || pool.limiterAddress !== null) ? (
            <Button
              variant="outline"
              size="sm"
              aria-label={`Configure ${voucher.symbol}`}
              onClick={() =>
                onConfigure({
                  voucher,
                  ratePpm: row.original.ratePpm,
                  capRaw:
                    row.original.cap.kind === "capped"
                      ? row.original.cap.raw
                      : row.original.cap.kind === "blocked"
                        ? "0"
                        : null,
                })
              }
            >
              Configure
            </Button>
          ) : null;
        },
      },
    ] satisfies ColumnDef<PoolHolding>[]
  ).map((column) => ({ ...column, enableSorting: false }));

  return (
    <>
      <p className="border-border text-muted-foreground border-b px-4 py-2.5 text-xs">
        {credit
          ? "Credit is the deposit cap minus the gross balance, floored at zero."
          : "Available liquidity excludes accrued pool fees when fees are held separately."}{" "}
        Amounts use each voucher's units.
      </p>
      {vouchersState.kind === "error" ||
      vouchersState.kind === "stale" ||
      treasuryState.kind === "error" ||
      treasuryState.kind === "stale" ||
      rates.isError ? (
        <p
          role="status"
          className="border-border text-muted-foreground border-b px-4 py-2.5 text-xs"
        >
          Some pool reads failed. Missing figures are unavailable; indexed balances and recorded
          caps may be out of date.
        </p>
      ) : null}
      <RecordPanel state={state}>
        <SectionState
          state={state}
          errorTitle={`Could not load ${credit ? "credit limits" : "holdings"}`}
          emptyTitle="No holdings or listed vouchers"
          emptyDescription="The pool holds no indexed tokens and lists no vouchers."
        >
          <DataTable columns={columns} data={holdings} className="border-0" />
        </SectionState>
      </RecordPanel>
      {indexed.hasNextPage ? (
        <div className="border-border flex items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-muted-foreground text-xs">More indexed holdings are available.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={indexed.isFetchingNextPage}
            onClick={() => void indexed.fetchNextPage()}
          >
            Load more holdings
          </Button>
        </div>
      ) : null}
      {vouchers.length < pool.voucherCount ? (
        <p className="text-muted-foreground px-4 py-2.5 text-xs">
          Showing {vouchers.length} of {pool.voucherCount} catalogued vouchers, plus indexed
          holdings.
        </p>
      ) : null}
    </>
  );
}

function CreditCap({ holding }: { holding: PoolHolding }) {
  if (holding.cap.kind === "capped" || holding.cap.kind === "blocked")
    return (
      <TokenAmount
        amount={holding.cap.kind === "capped" ? holding.cap.raw : "0"}
        decimals={holding.decimals}
      />
    );
  return (
    <span className="text-muted-foreground font-mono text-xs">
      {holding.cap.kind === "uncapped" ? "Uncapped" : "Not recorded"}
    </span>
  );
}
