import type { MarketVoucher } from "@clc/api/features/market/client";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { voucherFilteredPageQueryOptions } from "@clc/api/features/market/queries";
import { FilterChip, FilterGroup, ListToolbar } from "#/components/admin/list-toolbar";
import { TablePagination } from "#/components/admin/table-pagination";
import { clcApi } from "#/lib/api";
import { termFilter } from "#/lib/catalog-filter";
import { filterSearch } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";
import type { VouchersSearch } from "./vouchers-search";

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
      <span className="text-muted-foreground">{row.original.locationName ?? "—"}</span>
    ),
  },
];

const KINDS = ["goods", "services", "voucher"] as const;

export function VouchersPage({ search }: { search: VouchersSearch }) {
  const navigate = useNavigate();
  // The term goes to the endpoint, so a search covers the catalog rather than the
  // page in hand. `kind` stays local: /api/v2/vouchers has no kind parameter, and
  // the empty state below says so rather than implying the catalog was searched.
  //
  // `searched` is read back off the filter, not off `search.q`: a term the backend
  // would reject is normalized away, and the empty state must describe the request
  // that was actually made.
  const filter = termFilter(search.q ?? "");
  const searched = filter.term !== "";
  const vouchersQuery = useQuery(
    voucherFilteredPageQueryOptions(clcApi.market, {
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
      filter,
    }),
  );

  const fetched = vouchersQuery.data?.vouchers ?? [];
  const vouchers = search.kind ? fetched.filter((row) => row.kind === search.kind) : fetched;
  const listState = useDataState(vouchersQuery, (page) => page.vouchers.length === 0);
  const dropped = (vouchersQuery.data?.receivedCount ?? 0) - fetched.length;
  const table = usePagedTable({
    search,
    page: vouchersQuery.data,
    navigate: (next) => void navigate({ to: "/vouchers", search: next }),
  });

  const patch = (next: Partial<VouchersSearch>) =>
    void navigate({ to: "/vouchers", search: filterSearch(search, next) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vouchers"
        actions={
          <ListToolbar
            search={search.q}
            onSearchChange={(value) => patch({ q: value || undefined })}
            searchPlaceholder="Name, symbol, address"
            filters={
              <FilterGroup>
                <FilterChip active={!search.kind} onSelect={() => patch({ kind: undefined })}>
                  All
                </FilterChip>
                {KINDS.map((kind) => (
                  <FilterChip
                    key={kind}
                    active={search.kind === kind}
                    onSelect={() => patch({ kind })}
                  >
                    {kind}
                  </FilterChip>
                ))}
              </FilterGroup>
            }
          />
        }
      />

      {dropped > 0 ? (
        <Alert>
          <AlertTitle>
            {dropped} voucher{dropped === 1 ? "" : "s"} hidden
          </AlertTitle>
          <AlertDescription>
            Rows without coordinates or a known kind are dropped at the API boundary.
          </AlertDescription>
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
                title={searched || search.kind ? "No matching vouchers" : "No vouchers"}
                description={
                  searched
                    ? "No voucher in the catalog matches this search."
                    : search.kind
                      ? "No voucher on this page is of this kind."
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
