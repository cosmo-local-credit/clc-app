import type { UserPool } from "@clc/api/features/pools/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Link, useNavigate } from "@tanstack/react-router";
import { HiOutlinePlus, HiOutlineRefresh } from "react-icons/hi";
import { Button } from "#/components/ui/button";
import { EmptyState } from "#/components/admin/empty-state";
import { DataTable } from "#/components/admin/data-table";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { adminPoolsQueryOptions } from "@clc/api/features/admin/queries";
import { ListToolbar } from "#/components/admin/list-toolbar";
import { TablePagination } from "#/components/admin/table-pagination";
import { clcApi } from "#/lib/api";
import { termFilter } from "#/lib/catalog-filter";
import { filterSearch } from "#/lib/table-search";
import { POOL_STATUSES, type PoolListSearch } from "./pool-list-search";
import { Badge } from "#/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";

const columns: Array<ColumnDef<UserPool>> = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="truncate font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "symbol",
    header: "Symbol",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.symbol}</span>,
  },
  {
    accessorKey: "active",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="outline" className="font-mono text-xs uppercase">
        {row.original.active === false ? "Retired" : "Active"}
      </Badge>
    ),
  },
  {
    accessorKey: "address",
    header: "Address",
    cell: ({ row }) => (
      // The accessible route to the detail screen: focusable, keyboard-operable
      // and openable in a new tab, none of which a <tr> click handler provides.
      // stopPropagation keeps the row handler from navigating a second time.
      <Link
        to="/pools/$address"
        params={{ address: row.original.address }}
        search={{ tab: "vouchers" }}
        className="font-data text-xs underline-offset-4 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {formatVoucherAddress(row.original.address)}
      </Link>
    ),
  },
  {
    accessorKey: "voucherCount",
    header: "Vouchers",
    cell: ({ row }) => <span className="font-data">{row.original.voucherCount}</span>,
  },
  {
    accessorKey: "locationName",
    header: "Location",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.locationName ?? "—"}</span>
    ),
  },
];

export function PoolsPage({ search }: { search: PoolListSearch }) {
  const navigate = useNavigate();
  // The term goes to the endpoint, so a search covers every pool rather than the
  // page in hand. Read back off the filter rather than off `search.q`: a term the
  // backend would reject is normalized away, and the empty state must describe
  // the request that was actually made.
  const filter = termFilter(search.q ?? "");
  const searched = filter.term !== "";
  const poolsQuery = useQuery(
    adminPoolsQueryOptions(clcApi.admin, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
      filter,
      status: search.status ?? "all",
    }),
  );

  const pools = poolsQuery.data?.pools ?? [];
  const listState = useDataState(poolsQuery, (page) => page.pools.length === 0);
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
        actions={
          <>
            <ListToolbar
              search={search.q}
              onSearchChange={(value) =>
                void navigate({
                  to: "/pools",
                  search: filterSearch(search, { q: value || undefined }),
                })
              }
              searchPlaceholder="Name, symbol, address"
              filters={
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={[search.status ?? "all"]}
                  onValueChange={(values) => {
                    const status = values[0] as PoolListSearch["status"];
                    if (status)
                      void navigate({
                        to: "/pools",
                        search: filterSearch(search, {
                          status: status === "all" ? undefined : status,
                        }),
                      });
                  }}
                  aria-label="Pool status"
                  className="border-border bg-card h-9 items-center border p-0.5"
                >
                  {POOL_STATUSES.map((status) => (
                    <ToggleGroupItem
                      key={status}
                      value={status}
                      className="text-muted-foreground data-[pressed]:bg-muted data-[pressed]:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground h-full min-w-9 px-2.5 font-mono text-xs font-medium tracking-wide uppercase"
                    >
                      {status}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              }
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void poolsQuery.refetch()}
              disabled={poolsQuery.isFetching}
            >
              <HiOutlineRefresh />
              Refresh
            </Button>
            <Button nativeButton={false} render={<Link to="/pools/publish" />}>
              <HiOutlinePlus />
              Publish pool
            </Button>
          </>
        }
      />

      {listState.kind === "pending" ? (
        <LoadingBlock rows={8} />
      ) : listState.kind === "error" ? (
        <PageState title="Could not load pools" message={listState.message} />
      ) : (
        <>
          {listState.kind === "stale" ? <StaleNotice message={listState.message} /> : null}
          <DataTable
            columns={columns}
            data={pools}
            rowClassName="h-12"
            sorting={table.sorting}
            onSortChange={table.onSortChange}
            onRowClick={(pool) =>
              void navigate({
                to: "/pools/$address",
                params: { address: pool.address },
                search: { tab: "vouchers" },
              })
            }
            emptyState={<EmptyState title={searched ? "No matching pools" : "No pools"} />}
            footer={
              <TablePagination
                search={search}
                dropped={dropped}
                isFirstPage={table.isFirstPage}
                mightHaveMore={table.mightHaveMore}
                isFetching={poolsQuery.isFetching}
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
