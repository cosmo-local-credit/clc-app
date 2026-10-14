import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { POOL_PRICE_INDEX_DECIMALS } from "@clc/core/features/pool-admin/logic";
import type { ColumnDef } from "@tanstack/react-table";
import { ContractAddress, TokenAmount, VoucherCell } from "#/components/admin/chain-cells";
import { DataTable } from "#/components/admin/data-table";
import { RecordPanel } from "#/components/admin/record-panel";
import { SectionState } from "#/components/admin/section-state";
import type { DataState } from "#/lib/data-state";
import { usePoolRates } from "../use-pool-pricing";

export function PoolPricingPanel({
  pool,
  vouchers,
  state,
}: {
  pool: UserPool;
  vouchers: PoolVoucher[];
  state: DataState;
}) {
  const rates = usePoolRates(
    pool,
    vouchers.map((voucher) => voucher.tokenAddress),
    pool.quoterType === "relative",
  );
  const columns: ColumnDef<PoolVoucher>[] = [
    {
      id: "voucher",
      header: "Voucher",
      enableSorting: false,
      cell: ({ row }) => (
        <VoucherCell
          address={row.original.tokenAddress}
          name={row.original.name}
          symbol={row.original.symbol}
        />
      ),
    },
    {
      id: "pricing",
      header: "Pricing",
      enableSorting: false,
      cell: ({ row }) =>
        pool.quoterType === "relative" ? (
          <TokenAmount
            amount={rates.data?.[row.original.tokenAddress.toLowerCase()] ?? null}
            decimals={POOL_PRICE_INDEX_DECIMALS}
            symbol={pool.unitOfAccount ?? pool.symbol}
          />
        ) : (
          <span className="text-muted-foreground font-mono text-xs">
            {pool.quoterType === "decimal" ? "Equal value" : "Not recorded"}
          </span>
        ),
    },
  ];
  return (
    <>
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
        <span className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
          {pool.quoterType === "relative"
            ? "Relative rates"
            : pool.quoterType === "decimal"
              ? "Decimals only"
              : "Quoter type not recorded"}
        </span>
        <ContractAddress address={pool.quoterAddress} label="Copy quoter address" />
      </div>
      {rates.isError ? (
        <p role="status" className="text-muted-foreground px-4 py-2.5 text-xs">
          Relative rates could not be read. Missing rates are unavailable.
        </p>
      ) : null}
      <RecordPanel state={state}>
        <SectionState
          state={state}
          errorTitle="Could not load pricing"
          emptyTitle="No listed vouchers"
          loadingRows={4}
        >
          <DataTable columns={columns} data={vouchers} className="border-0" />
        </SectionState>
      </RecordPanel>
    </>
  );
}
