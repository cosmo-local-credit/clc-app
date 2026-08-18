import { ADMIN_POOL_TX_TYPES, type AdminPoolTransaction } from "@clc/api/features/admin/client";
import { adminPoolTransactionsQueryOptions } from "@clc/api/features/admin/queries";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AddressCell, PoolCell, TokenAmount, TxLink } from "#/components/admin/chain-cells";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { StateBadge } from "#/components/admin/state-badge";
import { TablePagination } from "#/components/admin/table-pagination";
import { TransactionTypeBadge } from "#/components/admin/transaction-type-badge";
import { clcApi } from "#/lib/api";
import { termFilter } from "#/lib/catalog-filter";
import { formatDateTime } from "#/lib/format";
import { filterSearch } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";
import { ChainTxToolbar } from "./transactions-toolbar";
import type { PoolTransactionsSearch } from "./transactions-search";

/**
 * What went through the commitment pools: swaps across them and deposits into
 * them.
 *
 * In and Out are one cell each — the figure over the voucher it is denominated
 * in — rather than four columns. It is the catalog table's name-over-symbol
 * pairing applied to an amount, and it keeps a swap readable as one line instead
 * of spreading a single fact across the width of the screen.
 *
 * A deposit fills only the In side. Nothing leaves the pool and no fee is
 * charged, so its Out and Fee cells are empty rather than zero.
 */
const columns: Array<ColumnDef<AdminPoolTransaction>> = [
  {
    accessorKey: "t",
    header: "Date",
    cell: ({ row }) => <span className="font-data text-xs">{formatDateTime(row.original.t)}</span>,
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <TransactionTypeBadge type={row.original.type} kind="pool transaction" />,
  },
  {
    id: "pool",
    header: "Pool",
    enableSorting: false,
    cell: ({ row }) => <PoolCell address={row.original.pool} />,
  },
  {
    id: "initiator",
    header: "Initiator",
    enableSorting: false,
    cell: ({ row }) => <AddressCell address={row.original.initiator} />,
  },
  {
    id: "amountIn",
    header: "In",
    meta: { align: "right" },
    enableSorting: false,
    cell: ({ row }) => (
      <TokenAmount
        amount={row.original.amountIn}
        decimals={row.original.tokenInDecimals}
        symbol={row.original.tokenInSymbol}
      />
    ),
  },
  {
    id: "amountOut",
    header: "Out",
    meta: { align: "right" },
    enableSorting: false,
    cell: ({ row }) => (
      <TokenAmount
        amount={row.original.amountOut}
        decimals={row.original.tokenOutDecimals}
        symbol={row.original.tokenOutSymbol}
      />
    ),
  },
  {
    id: "fee",
    header: "Fee",
    meta: { align: "right" },
    enableSorting: false,
    // Denominated in the out token, and excluding the protocol fee: the indexer
    // only records that separately for pools that emit SwapSettlement, and there
    // is no column for it yet.
    cell: ({ row }) => (
      <TokenAmount amount={row.original.fee} decimals={row.original.tokenOutDecimals} />
    ),
  },
  {
    accessorKey: "success",
    header: "Status",
    cell: ({ row }) => (
      <StateBadge state={row.original.success ? "SUCCESS" : "REVERTED"} kind="pool transaction" />
    ),
  },
  {
    id: "txHash",
    header: "Tx",
    enableSorting: false,
    cell: ({ row }) => <TxLink txHash={row.original.txHash} />,
  },
];

export function PoolTransactionsPage({ search }: { search: PoolTransactionsSearch }) {
  const navigate = useNavigate();
  const term = termFilter(search.q ?? "").term;
  const query = useQuery(
    adminPoolTransactionsQueryOptions(clcApi.admin, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
      type: search.type,
      pool: search.pool,
      ...(term ? { q: term } : {}),
    }),
  );

  const rows = query.data?.transactions ?? [];
  const listState = useDataState(query, (page) => page.transactions.length === 0);
  const table = usePagedTable({
    search,
    page: query.data,
    navigate: (next) => void navigate({ to: "/transactions/pools", search: next }),
  });
  const patch = (next: Partial<PoolTransactionsSearch>) =>
    void navigate({ to: "/transactions/pools", search: filterSearch(search, next) });

  const filtered = Boolean(search.type || search.pool || term);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pool transactions"
        actions={
          <ChainTxToolbar
            search={search.q ?? search.pool}
            onSearchChange={(q) => patch({ q, pool: undefined })}
            searchPlaceholder="Hash, initiator, pool, or voucher"
            types={ADMIN_POOL_TX_TYPES}
            activeType={search.type}
            onTypeChange={(type) => patch({ type })}
          />
        }
      />

      {listState.kind === "pending" ? (
        <LoadingBlock rows={8} />
      ) : listState.kind === "error" ? (
        <PageState title="Could not load pool transactions" message={listState.message} />
      ) : (
        <>
          {listState.kind === "stale" ? <StaleNotice message={listState.message} /> : null}
          <DataTable
            columns={columns}
            data={rows}
            sorting={table.sorting}
            onSortChange={table.onSortChange}
            emptyState={
              <EmptyState
                title={filtered ? "No matching transactions" : "No transactions"}
                description={
                  filtered
                    ? "No pool operation matches this filter."
                    : "The indexer has recorded no swaps or deposits."
                }
              />
            }
            footer={
              <TablePagination
                search={search}
                dropped={0}
                isFirstPage={table.isFirstPage}
                mightHaveMore={table.mightHaveMore}
                isFetching={query.isFetching}
                onFirstPage={table.onFirstPage}
                onPreviousPage={table.onPreviousPage}
                onNextPage={table.onNextPage}
                onPageSize={table.onPageSize}
              />
            }
          />
        </>
      )}
    </div>
  );
}
