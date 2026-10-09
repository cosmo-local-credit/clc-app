import type { AdminPoolTransaction } from "@clc/api/features/admin/client";
import { adminPoolTransactionsQueryOptions } from "@clc/api/features/admin/queries";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { PoolCell, TokenAmount, TxLink } from "#/components/admin/chain-cells";
import { DataTable } from "#/components/admin/data-table";
import { PoolProtocolFee } from "#/components/admin/pool-protocol-fee";
import { RecordPanel } from "#/components/admin/record-panel";
import { SectionHeading } from "#/components/admin/section-heading";
import { SectionState } from "#/components/admin/section-state";
import { clcApi } from "#/lib/api";
import { formatDateTime } from "#/lib/format";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";

const columns: ColumnDef<AdminPoolTransaction>[] = [
  {
    id: "date",
    header: "Date",
    cell: ({ row }) => <span className="font-data text-xs">{formatDateTime(row.original.t)}</span>,
  },
  { id: "pool", header: "Pool", cell: ({ row }) => <PoolCell address={row.original.pool} /> },
  {
    id: "out",
    header: "Out",
    cell: ({ row }) => (
      <TokenAmount
        amount={row.original.amountOut}
        decimals={row.original.tokenOutDecimals}
        symbol={row.original.tokenOutSymbol}
      />
    ),
  },
  {
    id: "poolFee",
    header: "Pool fee",
    cell: ({ row }) => (
      <TokenAmount
        amount={row.original.fee}
        decimals={row.original.tokenOutDecimals}
        symbol={row.original.tokenOutSymbol}
      />
    ),
  },
  {
    id: "protocolFee",
    header: "Protocol fee",
    cell: ({ row }) => <PoolProtocolFee transaction={row.original} />,
  },
  { id: "tx", header: "Tx", cell: ({ row }) => <TxLink txHash={row.original.txHash} /> },
];

/** A bounded activity list, not a total that combines unlike voucher units. */
export function LatestSwapsPanel() {
  const query = useQuery({
    ...adminPoolTransactionsQueryOptions(clcApi.admin, { perPage: 10, type: "swap" }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const state = useDataState(query, (page) => page.transactions.length === 0);
  return (
    <section className="border-border bg-card border">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <SectionHeading>Latest swaps</SectionHeading>
          <p className="text-muted-foreground mt-1 text-xs">
            The 10 most recent indexed swaps, across all dates. Fees use the output voucher's units.
          </p>
        </div>
        <Link
          to="/transactions/pools"
          search={{ perPage: DEFAULT_PAGE_SIZE, type: "swap" }}
          className="text-sm underline-offset-4 hover:underline"
        >
          Open swaps
        </Link>
      </div>
      <RecordPanel state={state}>
        <SectionState state={state} errorTitle="Could not load swaps" emptyTitle="No indexed swaps">
          <DataTable
            columns={columns.map((column) => ({ ...column, enableSorting: false }))}
            data={query.data?.transactions ?? []}
            className="border-0"
          />
        </SectionState>
      </RecordPanel>
    </section>
  );
}
