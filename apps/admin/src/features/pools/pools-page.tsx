import type { UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import { EmptyState } from "#/components/admin/empty-state";
import { DataTable } from "#/components/admin/data-table";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { Badge } from "#/components/ui/badge";
import { formatFeePpm } from "#/lib/format";
import { poolListQueryOptions } from "@clc/api/features/pools/queries";
import { TablePagination } from "#/components/admin/table-pagination";
import { clcApi } from "#/lib/api";
import type { TableSearch } from "#/lib/table-search";
import { usePagedTable } from "#/lib/use-paged-table";

const columns: Array<ColumnDef<UserPool>> = [
  {
    accessorKey: "name",
    header: "Pool",
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
    accessorKey: "voucherCount",
    header: "Vouchers",
    cell: ({ row }) => <span className="font-data">{row.original.voucherCount}</span>,
  },
  {
    accessorKey: "feePpm",
    header: "Swap fee",
    cell: ({ row }) => <span className="font-data">{formatFeePpm(row.original.feePpm)}</span>,
  },
  {
    accessorKey: "unitOfAccount",
    header: "Unit",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.unitOfAccount ?? "—"}</span>
    ),
  },
  {
    accessorKey: "locationName",
    header: "Location",
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{row.original.locationName ?? "—"}</span>
    ),
  },
  {
    id: "tags",
    header: "Tags",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="outline" className="font-mono text-xs">
            {tag}
          </Badge>
        ))}
        {row.original.tags.length > 3 ? (
          <span className="font-data text-xs text-muted-foreground">
            +{row.original.tags.length - 3}
          </span>
        ) : null}
      </div>
    ),
  },
];

export function PoolsPage({ search }: { search: TableSearch }) {
  const navigate = useNavigate();
  const poolsQuery = useQuery(
    poolListQueryOptions(clcApi.pools, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
    }),
  );

  const pools = poolsQuery.data?.pools ?? [];
  const dropped = (poolsQuery.data?.receivedCount ?? 0) - pools.length;
  const table = usePagedTable({
    search,
    page: poolsQuery.data,
    navigate: (next) => void navigate({ to: "/pools", search: next }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pools"
        description={
          search.sort
            ? "Every commitment pool the backend has indexed. Sorting applies to this page only."
            : "Every commitment pool the backend has indexed."
        }
      />

      {poolsQuery.isPending ? (
        <LoadingBlock rows={8} />
      ) : poolsQuery.isError ? (
        <PageState
          title="Could not load pools"
          message={poolsQuery.error instanceof Error ? poolsQuery.error.message : "Request failed."}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={pools}
            sorting={table.sorting}
            onSortChange={table.onSortChange}
            onRowClick={(pool) =>
              void navigate({ to: "/pools/$address", params: { address: pool.address } })
            }
            emptyState={
              <EmptyState
                title="No pools"
                description="The backend has not indexed any pools yet."
              />
            }
          />
          <TablePagination
            search={search}
            shown={pools.length}
            dropped={dropped}
            isFirstPage={table.isFirstPage}
            mightHaveMore={table.mightHaveMore}
            isFetching={poolsQuery.isFetching}
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
