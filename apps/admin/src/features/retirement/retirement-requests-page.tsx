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
import { Button } from "#/components/ui/button";
import { clcApi } from "#/lib/api";
import { formatDateTime } from "#/lib/format";
import { useDataState } from "#/lib/use-data-state";
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
      ...search,
      status: search.status ?? "pending",
      perPage: 25,
    }),
    refetchInterval: RETIREMENT_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  const state = useDataState(query, (page) => page.requests.length === 0);
  const filter = (next: Partial<RetirementSearch>) =>
    void navigate({
      to: "/retirement-requests",
      search: { ...search, ...next, cursor: undefined },
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
            data={query.data?.requests ?? []}
            emptyState={
              <EmptyState
                title="No retirement requests"
                description="No requests match these filters."
              />
            }
            footer={
              <div className="flex items-center justify-end gap-2 p-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!search.cursor || query.isFetching}
                  onClick={() =>
                    void navigate({
                      to: "/retirement-requests",
                      search: { ...search, cursor: undefined },
                    })
                  }
                >
                  First page
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!query.data?.nextCursor || query.isFetching}
                  onClick={() => {
                    if (query.data?.nextCursor)
                      void navigate({
                        to: "/retirement-requests",
                        search: { ...search, cursor: query.data.nextCursor },
                      });
                  }}
                >
                  Older requests
                </Button>
              </div>
            }
          />
        </>
      )}
    </div>
  );
}
