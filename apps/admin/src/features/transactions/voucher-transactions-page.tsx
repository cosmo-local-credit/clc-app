import {
  ADMIN_VOUCHER_TX_TYPES,
  type AdminVoucherTransaction,
} from "@clc/api/features/admin/client";
import { adminVoucherTransactionsQueryOptions } from "@clc/api/features/admin/queries";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { AddressCell, TokenAmount, TxLink, VoucherCell } from "#/components/admin/chain-cells";
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
import type { VoucherTransactionsSearch } from "./transactions-search";

/**
 * Every movement of every voucher: a transfer between accounts, a mint into
 * one, or a burn out of circulation.
 *
 * One row is one movement. A mint and a burn each also emit an ERC-20 Transfer
 * log with the zero address on one side, and clc-core drops those mirrors, so
 * the amounts down this column sum to real volume rather than to twice it.
 */
const columns: Array<ColumnDef<AdminVoucherTransaction>> = [
  {
    accessorKey: "t",
    header: "Date",
    cell: ({ row }) => <span className="font-data text-xs">{formatDateTime(row.original.t)}</span>,
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <TransactionTypeBadge type={row.original.type} kind="voucher transaction" />,
  },
  {
    id: "voucher",
    header: "Voucher",
    // No accessor: the cell reads three fields, and sorting a page by voucher
    // name would order rows by something the backend did not order them by.
    enableSorting: false,
    cell: ({ row }) => (
      <VoucherCell
        address={row.original.voucher}
        name={row.original.voucherName}
        symbol={row.original.voucherSymbol}
      />
    ),
  },
  {
    id: "from",
    header: "From",
    enableSorting: false,
    cell: ({ row }) => <AddressCell address={row.original.from} />,
  },
  {
    id: "to",
    header: "To",
    enableSorting: false,
    cell: ({ row }) => <AddressCell address={row.original.to} />,
  },
  {
    id: "amount",
    header: "Amount",
    // Amounts on this page belong to different vouchers with different decimals,
    // so ordering them against each other would compare unlike things. The Date
    // and Type headers are the two that sort.
    enableSorting: false,
    cell: ({ row }) => (
      <TokenAmount amount={row.original.amount} decimals={row.original.voucherDecimals} />
    ),
  },
  {
    accessorKey: "success",
    header: "Status",
    cell: ({ row }) => (
      <StateBadge
        state={row.original.success ? "SUCCESS" : "REVERTED"}
        kind="voucher transaction"
      />
    ),
  },
  {
    id: "txHash",
    header: "Tx",
    enableSorting: false,
    cell: ({ row }) => <TxLink txHash={row.original.txHash} />,
  },
];

export function VoucherTransactionsPage({ search }: { search: VoucherTransactionsSearch }) {
  const navigate = useNavigate();
  const term = termFilter(search.q ?? "").term;
  const query = useQuery(
    adminVoucherTransactionsQueryOptions(clcApi.admin, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
      type: search.type,
      voucher: search.voucher,
      ...(term ? { q: term } : {}),
    }),
  );

  const rows = query.data?.transactions ?? [];
  const listState = useDataState(query, (page) => page.transactions.length === 0);
  const table = usePagedTable({
    search,
    page: query.data,
    navigate: (next) => void navigate({ to: "/transactions/vouchers", search: next }),
  });
  const patch = (next: Partial<VoucherTransactionsSearch>) =>
    void navigate({ to: "/transactions/vouchers", search: filterSearch(search, next) });

  const filtered = Boolean(search.type || search.voucher || term);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Voucher transactions"
        actions={
          <ChainTxToolbar
            search={search.q ?? search.voucher}
            onSearchChange={(q) => patch({ q, voucher: undefined })}
            searchPlaceholder="From, to, hash, or voucher"
            types={ADMIN_VOUCHER_TX_TYPES}
            activeType={search.type}
            onTypeChange={(type) => patch({ type })}
          />
        }
      />

      {listState.kind === "pending" ? (
        <LoadingBlock rows={8} />
      ) : listState.kind === "error" ? (
        <PageState title="Could not load voucher transactions" message={listState.message} />
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
                    ? "No voucher movement matches this filter."
                    : "The indexer has recorded no voucher movements."
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
