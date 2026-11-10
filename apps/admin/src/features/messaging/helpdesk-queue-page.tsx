import type { AdminHelpdeskItem } from "@clc/core/features/messaging/logic";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { HiOutlineRefresh } from "react-icons/hi";
import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { StateBadge } from "#/components/admin/state-badge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { formatDateTime } from "#/lib/format";
import { useDataState } from "#/lib/use-data-state";
import { HELPDESK_STATUSES, type HelpdeskSearch } from "./messaging-search";
import { messagePreview } from "./ui/message-images";
import { PeerIdentity, peerName } from "./ui/peer-identity";
import { QueueFooter, QueueStatusFilter } from "./ui/queue-controls";
import { useHelpdeskQueue } from "./use-helpdesk";

const columns: ColumnDef<AdminHelpdeskItem>[] = [
  {
    id: "user",
    header: "User",
    cell: ({ row }) => (
      <PeerIdentity
        peer={row.original.user}
        name={
          <Link
            to="/helpdesk/$conversationId"
            params={{ conversationId: String(row.original.id) }}
            className="underline underline-offset-4"
          >
            {peerName(row.original.user)}
          </Link>
        }
      />
    ),
  },
  {
    id: "lastMessage",
    header: "Last message",
    cell: ({ row }) => {
      const message = row.original.lastMessage;
      if (!message) return <span className="text-muted-foreground">No messages</span>;
      return (
        <span className="flex max-w-md flex-col gap-0.5">
          <span className="font-mono text-muted-foreground text-xs">
            {message.sender === "support" ? "Support" : "User"}
          </span>
          <span dir="auto" className="line-clamp-2 whitespace-pre-wrap break-words">
            {messagePreview(message)}
          </span>
        </span>
      );
    },
  },
  {
    id: "needsReply",
    header: "Reply",
    cell: ({ row }) =>
      row.original.needsReply ? (
        <Badge
          variant="outline"
          className="border-state-pending/30 bg-state-pending/10 text-state-pending font-mono text-xs uppercase"
        >
          Needs reply
        </Badge>
      ) : (
        <span className="text-muted-foreground font-mono text-xs">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StateBadge state={row.original.status} kind="conversation" />,
  },
  {
    id: "lastMessageAt",
    header: "Last activity",
    cell: ({ row }) => (
      <span className="font-data text-xs">
        {formatDateTime(row.original.lastMessageAt ?? row.original.updatedAt)}
      </span>
    ),
  },
];

export function HelpdeskQueuePage({ search }: { search: HelpdeskSearch }) {
  const navigate = useNavigate();
  const status = search.status ?? "open";
  const query = useHelpdeskQueue(status);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const waiting = items.filter((item) => item.needsReply).length;
  const state = useDataState(query, (data) => data.pages.every((page) => page.items.length === 0));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Helpdesk"
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
          id="helpdesk-status"
          value={status}
          statuses={HELPDESK_STATUSES}
          onChange={(next) =>
            void navigate({
              to: "/helpdesk",
              search: next === "open" ? {} : { status: next },
            })
          }
        />
        {status === "open" && state.kind !== "pending" && state.kind !== "error" ? (
          <p className="font-data text-muted-foreground pb-2 text-xs" aria-live="polite">
            {waiting} waiting for a reply
            {query.hasNextPage ? " in the loaded rows" : ""}
          </p>
        ) : null}
      </div>
      {state.kind === "pending" ? (
        <LoadingBlock rows={6} />
      ) : state.kind === "error" ? (
        <div className="space-y-3">
          <PageState title="Could not load the helpdesk queue" message={state.message} />
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          {state.kind === "stale" ? <StaleNotice message={state.message} /> : null}
          <DataTable
            columns={columns}
            data={items}
            rowClassName="h-14"
            onRowClick={(item) =>
              void navigate({
                to: "/helpdesk/$conversationId",
                params: { conversationId: String(item.id) },
              })
            }
            emptyState={
              <EmptyState
                title={status === "open" ? "No open conversations" : "No resolved conversations"}
              />
            }
            footer={
              <QueueFooter
                count={items.length}
                noun={["conversation", "conversations"]}
                hasNextPage={query.hasNextPage}
                isFetchingNextPage={query.isFetchingNextPage}
                onLoadMore={() => void query.fetchNextPage()}
              />
            }
          />
        </>
      )}
    </div>
  );
}
