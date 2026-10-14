import type { AdminVoucher } from "@clc/api/features/admin/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { HiOutlinePlus, HiOutlineRefresh } from "react-icons/hi";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { adminVouchersQueryOptions } from "@clc/api/features/admin/queries";
import { ListToolbar } from "#/components/admin/list-toolbar";
import { TablePagination } from "#/components/admin/table-pagination";
import { clcApi } from "#/lib/api";
import { termFilter } from "#/lib/catalog-filter";
import { filterSearch } from "#/lib/table-search";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { Badge } from "#/components/ui/badge";
import { VOUCHER_STATUSES, type VoucherListSearch } from "#/features/vouchers/voucher-list-search";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";

const columns: Array<ColumnDef<AdminVoucher>> = [
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
    cell: ({ row }) =>
      row.original.active ? (
        <Badge variant="outline" className="font-mono text-xs uppercase">
          Active
        </Badge>
      ) : (
        <Badge variant="outline" className="text-destructive font-mono text-xs uppercase">
          Retired
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
        to="/vouchers/$address"
        params={{ address: row.original.address }}
        search={{ tab: "offerings" }}
        className="font-data text-xs underline-offset-4 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {formatVoucherAddress(row.original.address)}
      </Link>
    ),
  },
  {
    accessorKey: "locationName",
    header: "Location",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.locationName ?? "—"}</span>
    ),
  },
];

export function VouchersPage({ search }: { search: VoucherListSearch }) {
  const navigate = useNavigate();
  // The term goes to the endpoint, so a search covers the catalog rather than the
  // page in hand. `searched` is read back off the filter, not off `search.q`: a
  // term the backend would reject is normalized away, and the empty state must
  // describe the request that was actually made.
  const filter = termFilter(search.q ?? "");
  const searched = filter.term !== "";
  // The console's own endpoint, not the public catalog: that one filters `active`
  // and complete coordinates, so a retired or ungeolocated voucher would be
  // unreachable here — and retiring one would remove the only screen it could be
  // restored from.
  const vouchersQuery = useQuery(
    adminVouchersQueryOptions(clcApi.admin, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
      filter,
      status: search.status ?? "all",
    }),
  );

  const vouchers = vouchersQuery.data?.vouchers ?? [];
  const listState = useDataState(vouchersQuery, (page) => page.vouchers.length === 0);
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
        actions={
          <>
            <ListToolbar
              search={search.q}
              onSearchChange={(value) =>
                void navigate({
                  to: "/vouchers",
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
                    const next = values[0] as VoucherListSearch["status"] | undefined;
                    // Base UI lets the active segment be cleared; clicking the
                    // selected one is a no-op rather than a reset to nothing.
                    if (!next) return;
                    void navigate({
                      to: "/vouchers",
                      search: filterSearch(search, {
                        status: next === "all" ? undefined : next,
                      }),
                    });
                  }}
                  aria-label="Voucher status"
                  className="border-border bg-card h-9 items-center border p-0.5"
                >
                  {VOUCHER_STATUSES.map((status) => (
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
              onClick={() => void vouchersQuery.refetch()}
              disabled={vouchersQuery.isFetching}
            >
              <HiOutlineRefresh />
              Refresh
            </Button>
            <Button nativeButton={false} render={<Link to="/vouchers/publish" />}>
              <HiOutlinePlus />
              Publish voucher
            </Button>
          </>
        }
      />

      {dropped > 0 ? (
        <Alert>
          <AlertTitle>
            {dropped} voucher{dropped === 1 ? "" : "s"} hidden
          </AlertTitle>
          <AlertDescription>Missing wallet address or chain.</AlertDescription>
        </Alert>
      ) : null}

      {listState.kind === "pending" ? (
        <LoadingBlock rows={8} />
      ) : listState.kind === "error" ? (
        <PageState title="Could not load vouchers" message={listState.message} />
      ) : (
        <>
          {listState.kind === "stale" ? <StaleNotice message={listState.message} /> : null}
          <DataTable
            columns={columns}
            data={vouchers}
            rowClassName="h-12"
            sorting={table.sorting}
            onSortChange={table.onSortChange}
            onRowClick={(voucher) =>
              void navigate({
                to: "/vouchers/$address",
                params: { address: voucher.address },
                search: { tab: "offerings" },
              })
            }
            emptyState={
              <EmptyState
                title={searched ? "No matching vouchers" : "No vouchers"}
                description={
                  searched
                    ? "No voucher in the catalog matches this search."
                    : search.status === "retired"
                      ? "No voucher has been retired."
                      : "The catalog is empty."
                }
              />
            }
            footer={
              <TablePagination
                search={search}
                dropped={dropped}
                isFirstPage={table.isFirstPage}
                mightHaveMore={table.mightHaveMore}
                isFetching={vouchersQuery.isFetching}
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
