import type { MarketVoucher } from "@clc/api/features/market/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { voucherListQueryOptions } from "@clc/api/features/market/queries";
import { TablePagination } from "#/components/admin/table-pagination";
import { clcApi } from "#/lib/api";
import type { TableSearch } from "#/lib/table-search";
import { usePagedTable } from "#/lib/use-paged-table";

const columns: Array<ColumnDef<MarketVoucher>> = [
  {
    accessorKey: "name",
    header: "Voucher",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.name}</div>
        <div className="font-mono text-xs text-muted-foreground">{row.original.symbol}</div>
      </div>
    ),
  },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => (
      <span className="font-data text-xs">{formatVoucherAddress(row.original.address)}</span>
    ),
  },
  {
    accessorKey: "kind",
    header: "Kind",
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono text-xs uppercase">
        {row.original.kind}
      </Badge>
    ),
  },
  {
    accessorKey: "chainId",
    header: "Chain",
    cell: ({ row }) => <span className="font-data">{row.original.chainId}</span>,
  },
  {
    accessorKey: "locationName",
    header: "Location",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.locationName ?? "—"}</span>
    ),
  },
];

export function VouchersPage({ search }: { search: TableSearch }) {
  const navigate = useNavigate();
  const vouchersQuery = useQuery(
    voucherListQueryOptions(clcApi.market, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
    }),
  );

  const vouchers = vouchersQuery.data?.vouchers ?? [];
  const dropped = (vouchersQuery.data?.receivedCount ?? 0) - vouchers.length;
  const table = usePagedTable({
    search,
    page: vouchersQuery.data,
    navigate: (next) => void navigate({ to: "/vouchers", search: next }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vouchers"
        description={
          search.sort
            ? "Every voucher in the public catalog. Sorting applies to this page only."
            : "Every voucher in the public catalog."
        }
      />

      {dropped > 0 ? (
        <Alert>
          <AlertTitle>
            {dropped} voucher{dropped === 1 ? "" : "s"} hidden
          </AlertTitle>
          <AlertDescription>
            The catalog endpoint returns only vouchers with valid coordinates and a known kind. Rows
            missing either are dropped at the API boundary and cannot be listed here.
          </AlertDescription>
        </Alert>
      ) : null}

      {vouchersQuery.isPending ? (
        <LoadingBlock rows={8} />
      ) : vouchersQuery.isError ? (
        <PageState
          title="Could not load vouchers"
          message={
            vouchersQuery.error instanceof Error ? vouchersQuery.error.message : "Request failed."
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={vouchers}
            sorting={table.sorting}
            onSortChange={table.onSortChange}
            onRowClick={(voucher) =>
              void navigate({ to: "/vouchers/$address", params: { address: voucher.address } })
            }
            emptyState={<EmptyState title="No vouchers" description="The catalog is empty." />}
          />
          <TablePagination
            search={search}
            shown={vouchers.length}
            dropped={dropped}
            isFirstPage={table.isFirstPage}
            mightHaveMore={table.mightHaveMore}
            isFetching={vouchersQuery.isFetching}
            onFirstPage={table.onFirstPage}
            onPreviousPage={table.onPreviousPage}
            onNextPage={table.onNextPage}
            onPageSize={table.onPageSize}
          />
        </>
      )}
    </div>
  );
}
