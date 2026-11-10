import {
  adminAbuseReportsInfiniteQueryOptions,
  adminMessagingKeys,
} from "@clc/api/features/messaging/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import type { AbuseReportResolution, AdminAbuseReport } from "@clc/core/features/messaging/logic";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { HiOutlineRefresh } from "react-icons/hi";
import { toast } from "sonner";
import { ConfirmDialog } from "#/components/admin/confirm-dialog";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { StateBadge } from "#/components/admin/state-badge";
import { Button } from "#/components/ui/button";
import { errorMessage } from "#/lib/data-state";
import { formatDateTime } from "#/lib/format";
import { adminMessaging } from "#/lib/messaging";
import { useDataState } from "#/lib/use-data-state";
import { ABUSE_REPORT_STATUSES, type AbuseReportSearch } from "./messaging-search";
import { MessageImages } from "./ui/message-images";
import { PeerIdentity } from "./ui/peer-identity";
import { QueueFooter, QueueStatusFilter } from "./ui/queue-controls";
import { QUEUE_POLL_MS } from "./use-helpdesk";

type Resolution = { report: AdminAbuseReport; status: AbuseReportResolution };

export function AbuseReportsPage({ search }: { search: AbuseReportSearch }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = search.status ?? "open";
  const [pendingResolution, setPendingResolution] = useState<Resolution | null>(null);
  const query = useInfiniteQuery({
    ...adminAbuseReportsInfiniteQueryOptions(adminMessaging, status),
    refetchInterval: QUEUE_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
  });
  const resolve = useMutation({
    mutationFn: ({ report, status }: Resolution) =>
      adminMessaging.resolveAbuseReport(report.id, status),
    onSuccess: async (report) => {
      // Every status's list: the report leaves `open` and joins its outcome.
      await queryClient.invalidateQueries({
        queryKey: [...adminMessagingKeys.all, "abuse-reports"],
      });
      toast.success(report.status === "actioned" ? "Report actioned" : "Report dismissed");
      setPendingResolution(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const reports = query.data?.pages.flatMap((page) => page.items) ?? [];
  const state = useDataState(query, (data) => data.pages.every((page) => page.items.length === 0));

  const columns: ColumnDef<AdminAbuseReport>[] = [
    {
      id: "reported",
      header: "Reported",
      cell: ({ row }) => <PeerIdentity peer={row.original.reported} />,
    },
    {
      id: "reporter",
      header: "Reporter",
      cell: ({ row }) => <PeerIdentity peer={row.original.reporter} />,
    },
    {
      id: "message",
      header: "Message",
      cell: ({ row }) => <ReportedMessage report={row.original} />,
    },
    {
      id: "comment",
      header: "Comment",
      cell: ({ row }) =>
        row.original.comment ? (
          <p dir="auto" className="max-w-xs whitespace-pre-wrap break-words">
            {row.original.comment}
          </p>
        ) : (
          <span className="text-muted-foreground">No comment</span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: "Reported at",
      cell: ({ row }) => (
        <span className="font-data text-xs">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const report = row.original;
        if (report.status === "open") {
          return (
            <span className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label={`Dismiss report ${report.id}`}
                onClick={() => setPendingResolution({ report, status: "dismissed" })}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                variant="destructive"
                aria-label={`Action report ${report.id}`}
                onClick={() => setPendingResolution({ report, status: "actioned" })}
              >
                Action
              </Button>
            </span>
          );
        }
        return (
          <span className="flex flex-col items-start gap-1">
            <StateBadge state={report.status} kind="report" />
            {report.resolvedBy ? (
              <span className="font-data text-muted-foreground text-xs" title={report.resolvedBy}>
                {formatVoucherAddress(report.resolvedBy as `0x${string}`)}
              </span>
            ) : null}
            <span className="font-data text-muted-foreground text-xs">
              {formatDateTime(report.resolvedAt)}
            </span>
          </span>
        );
      },
    },
  ];

  const dismissing = pendingResolution?.status === "dismissed";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Abuse reports"
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
        <QueueStatusFilter
          id="abuse-report-status"
          value={status}
          statuses={ABUSE_REPORT_STATUSES}
          onChange={(next) =>
            void navigate({
              to: "/abuse-reports",
              search: next === "open" ? {} : { status: next },
            })
          }
        />
      </div>
      {state.kind === "pending" ? (
        <LoadingBlock rows={6} />
      ) : state.kind === "error" ? (
        <div className="space-y-3">
          <PageState title="Could not load abuse reports" message={state.message} />
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          {state.kind === "stale" ? <StaleNotice message={state.message} /> : null}
          <DataTable
            columns={columns}
            data={reports}
            emptyState={<EmptyState title={`No ${status} reports`} />}
            footer={
              <QueueFooter
                count={reports.length}
                noun={["report", "reports"]}
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                onLoadMore={() => void query.fetchNextPage()}
              />
            }
          />
        </>
      )}
      <ConfirmDialog
        open={pendingResolution !== null}
        title={dismissing ? "Dismiss report" : "Action report"}
        description={
          dismissing
            ? "Closes the report with no action taken. The reported message can be pruned again."
            : "Records that you acted on this report. The reported message can be pruned again."
        }
        confirmLabel={dismissing ? "Dismiss" : "Mark actioned"}
        destructive={!dismissing}
        pending={resolve.isPending}
        onCancel={() => setPendingResolution(null)}
        onConfirm={() => {
          if (pendingResolution) resolve.mutate(pendingResolution);
        }}
      />
    </div>
  );
}

function ReportedMessage({ report }: { report: AdminAbuseReport }) {
  const message = report.message;
  if (!message) return <span className="text-muted-foreground">No message attached</span>;
  return (
    <div className="flex max-w-md flex-col gap-2">
      {message.body ? (
        <p dir="auto" className="whitespace-pre-wrap break-words">
          {message.body}
        </p>
      ) : null}
      <MessageImages urls={message.imageUrls} />
      <span className="font-data text-muted-foreground text-xs">
        Sent {formatDateTime(message.createdAt)}
      </span>
    </div>
  );
}
