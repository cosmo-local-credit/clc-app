import type { RetirementRequest } from "@clc/api/features/retirement/client";
import { adminRetirementRequestsQueryOptions } from "@clc/api/features/retirement/queries";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { HiOutlineRefresh } from "react-icons/hi";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { TablePagination } from "#/components/admin/table-pagination";
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";
import { formatDateTime } from "#/lib/format";
import { filterSearch } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";
import { usePagedTable } from "#/lib/use-paged-table";
import { RETIREMENT_STATUSES, type RetirementSearch } from "./retirement-search";
import { RetirementStatus } from "./retirement-status";
import { RETIREMENT_POLL_MS } from "./use-retirement";

const columns: ColumnDef<RetirementRequest>[] = [
  {
    accessorKey: "resourceName",
    header: "Resource",
    cell: ({ row }) => (
      <Link
        to="/retirement-requests/$requestId"
        params={{ requestId: String(row.original.id) }}
        className="font-medium underline underline-offset-4"
      >
        {row.original.resourceName || row.original.symbol || row.original.resourceAddress}
      </Link>
    ),
  },
  {
    accessorKey: "resourceType",
    header: "Type",
    cell: ({ row }) => <span className="capitalize">{row.original.resourceType}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <RetirementStatus status={row.original.status} />,
  },
  {
    accessorKey: "reason",
    header: "Reason",
    cell: ({ row }) => (
      <span className="line-clamp-2 max-w-sm whitespace-pre-wrap break-words">
        {row.original.reason}
      </span>
    ),
  },
  {
    accessorKey: "requestedAt",
    header: "Requested",
    cell: ({ row }) => (
      <span className="font-data text-xs">{formatDateTime(row.original.requestedAt)}</span>
    ),
  },
];

const selectClass = "border-input bg-card h-9 border px-2 text-sm focus-visible:outline-ring";

export function RetirementRequestsPage({ search }: { search: RetirementSearch }) {
  const navigate = useNavigate();
  const query = useQuery({
    ...adminRetirementRequestsQueryOptions(clcApi.retirement, {
      status: search.status ?? "pending",
      resourceType: search.resourceType,
      perPage: search.perPage,
      cursor: search.cursor,
      next: search.dir === undefined ? undefined : search.dir === "next",
    }),
    refetchInterval: RETIREMENT_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  const requests = query.data?.requests ?? [];
  const state = useDataState(query, (page) => page.requests.length === 0);
  const dropped = (query.data?.receivedCount ?? 0) - requests.length;
  const table = usePagedTable({
    search,
    page: query.data,
    navigate: (next) => void navigate({ to: "/retirement-requests", search: next }),
  });
  const filter = (next: Partial<RetirementSearch>) =>
    void navigate({
      to: "/retirement-requests",
      search: filterSearch(search, next),
    });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Retirement requests"
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <HiOutlineRefresh />
            Refresh
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs" htmlFor="retirement-status">
          Status
          <select
            id="retirement-status"
            className={selectClass}
            value={search.status ?? "pending"}
            onChange={(event) =>
              filter({ status: event.target.value as RetirementSearch["status"] })
            }
          >
            {RETIREMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status[0]?.toUpperCase()}
                {status.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" htmlFor="retirement-type">
          Resource type
          <select
            id="retirement-type"
            className={selectClass}
            value={search.resourceType ?? "all"}
            onChange={(event) =>
              filter({
                resourceType:
                  event.target.value === "all"
                    ? undefined
                    : (event.target.value as RetirementSearch["resourceType"]),
              })
            }
          >
            <option value="all">Vouchers and pools</option>
            <option value="voucher">Vouchers</option>
            <option value="pool">Pools</option>
          </select>
        </label>
      </div>
      {state.kind === "pending" ? (
        <LoadingBlock rows={6} />
      ) : state.kind === "error" ? (
        <PageState title="Could not load retirement requests" message={state.message} />
      ) : (
        <>
          {state.kind === "stale" ? <StaleNotice message={state.message} /> : null}
          <DataTable
            columns={columns}
            data={requests}
            rowClassName="h-12"
            emptyState={
              <EmptyState
                title="No retirement requests"
                description="No requests match these filters."
              />
            }
            footer={
              <TablePagination
                search={search}
                dropped={dropped}
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
