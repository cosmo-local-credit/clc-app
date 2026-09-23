import type { ManagedReportSummary } from "@clc/api/features/reports/client";
import { adminReportsQueryOptions } from "@clc/api/features/reports/queries";
import { formatVoucherAddress } from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { HiOutlineCheck, HiOutlinePlus, HiOutlineRefresh } from "react-icons/hi";
import { toast } from "sonner";

import { DataTable } from "#/components/admin/data-table";
import { EmptyState } from "#/components/admin/empty-state";
import { ListToolbar } from "#/components/admin/list-toolbar";
import { LoadingBlock } from "#/components/admin/loading-block";
import { PageHeader } from "#/components/admin/page-header";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { StateBadge } from "#/components/admin/state-badge";
import { TablePagination } from "#/components/admin/table-pagination";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { clcApi } from "#/lib/api";
import { relationshipFilter } from "#/lib/catalog-filter";
import { formatDateTime } from "#/lib/format";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import { useDataState } from "#/lib/use-data-state";
import {
  POST_STATUS_FILTERS,
  POST_STATUS_LABELS,
  postCursorParam,
  postFilterSearch,
  postNextParam,
  postStatusParam,
  parsePostStatusFilter,
  type PostSearch,
} from "./post-search";
import { PostConfirmDialog } from "./ui/post-confirm-dialog";
import { useApprovePost, useDeletePost } from "./use-post-mutations";
import { usePostTable } from "./use-post-table";

const STATUS_OPTIONS = POST_STATUS_FILTERS.map((status) => ({
  value: status,
  label: POST_STATUS_LABELS[status],
}));

type RowAction = { kind: "approve" | "delete"; post: ManagedReportSummary };

/**
 * The post moderation queue.
 *
 * Defaults to `SUBMITTED`, because that is the work: an operator opening this
 * screen is here to review what is waiting. Every filter, the page and the
 * ordering live in the URL, so a view is linkable and Back restores it.
 */
export function PostsPage({ search }: { search: PostSearch }) {
  const navigate = useNavigate();
  const [action, setAction] = useState<RowAction | null>(null);

  const filter = relationshipFilter({ q: search.q, tags: search.tags, vouchers: search.vouchers });
  const postsQuery = useQuery(
    adminReportsQueryOptions(clcApi.reports, {
      perPage: search.perPage,
      status: postStatusParam(search.status),
      cursor: postCursorParam(search),
      next: postNextParam(search),
      author: search.author,
      filter,
    }),
  );

  const approve = useApprovePost();
  const remove = useDeletePost(action?.post.status);

  const posts = postsQuery.data?.reports ?? [];
  const listState = useDataState(postsQuery, (page) => page.reports.length === 0);
  const dropped = (postsQuery.data?.receivedCount ?? 0) - posts.length;
  const table = usePostTable({
    search,
    page: postsQuery.data,
    navigate: (next) => void navigate({ to: "/posts", search: next }),
  });

  const filtered =
    search.status !== "SUBMITTED" ||
    Boolean(search.q) ||
    Boolean(search.author) ||
    Boolean(search.tags) ||
    Boolean(search.vouchers);

  async function runAction() {
    if (!action) return;
    try {
      if (action.kind === "approve") {
        await approve.mutateAsync(action.post.id);
        toast.success("Post approved.");
      } else {
        await remove.mutateAsync(action.post.id);
        toast.success("Post deleted.");
      }
      setAction(null);
    } catch (error) {
      // The dialog stays open so the operator can retry or back out.
      toast.error(error instanceof Error ? error.message : "The action failed.");
    }
  }

  const columns: Array<ColumnDef<ManagedReportSummary>> = [
    {
      accessorKey: "title",
      header: "Post",
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            to="/posts/$reportId"
            params={{ reportId: row.original.id }}
            className="truncate font-medium underline-offset-4 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.title}
          </Link>
          {row.original.description ? (
            <div className="text-muted-foreground truncate text-xs">{row.original.description}</div>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StateBadge state={row.original.status} kind="post" />,
    },
    {
      accessorKey: "authorAddress",
      header: "Author",
      cell: ({ row }) =>
        row.original.authorAddress ? (
          <Link
            to="/users/$address"
            params={{ address: row.original.authorAddress }}
            search={{ tab: "reports", perPage: DEFAULT_PAGE_SIZE }}
            className="font-data text-xs underline-offset-4 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {formatVoucherAddress(row.original.authorAddress)}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "relations",
      header: "Tags and vouchers",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="font-mono text-xs">
              {tag}
            </Badge>
          ))}
          {row.original.vouchers.length > 0 ? (
            <Badge variant="outline" className="font-mono text-xs">
              {row.original.vouchers.length} voucher
              {row.original.vouchers.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="font-data text-xs">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      cell: ({ row }) => (
        <span className="font-data text-xs">{formatDateTime(row.original.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div
          className="flex justify-end gap-1"
          // The row itself navigates, so the controls inside it must not.
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link to="/posts/$reportId" params={{ reportId: row.original.id }} />}
          >
            Review
          </Button>
          {row.original.status === "APPROVED" ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={approve.isPending}
              onClick={() => setAction({ kind: "approve", post: row.original })}
            >
              <HiOutlineCheck />
              Approve
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={remove.isPending}
            onClick={() => setAction({ kind: "delete", post: row.original })}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Posts"
        actions={
          <>
            {/* The raw term stays in the URL and `relationshipFilter` drops it
                while it is under two characters, so the box keeps a
                one-character draft and no request is a guaranteed 400. */}
            <ListToolbar
              search={search.q}
              onSearchChange={(value) =>
                void navigate({
                  to: "/posts",
                  search: postFilterSearch(search, { q: value || undefined }),
                })
              }
              searchPlaceholder="Title or summary"
            />
            <Select
              items={STATUS_OPTIONS}
              value={search.status}
              onValueChange={(value) =>
                void navigate({
                  to: "/posts",
                  search: postFilterSearch(search, { status: parsePostStatusFilter(value) }),
                })
              }
            >
              <SelectTrigger size="default" className="w-44 px-2.5" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => void postsQuery.refetch()}
              disabled={postsQuery.isFetching}
            >
              <HiOutlineRefresh />
              Refresh
            </Button>
            <Button nativeButton={false} render={<Link to="/posts/new" />}>
              <HiOutlinePlus />
              New post
            </Button>
          </>
        }
      />

      {listState.kind === "pending" ? (
        <LoadingBlock rows={8} />
      ) : listState.kind === "error" ? (
        <PageState title="Could not load posts" message={listState.message} />
      ) : (
        <>
          {listState.kind === "stale" ? <StaleNotice message={listState.message} /> : null}
          <DataTable
            columns={columns}
            data={posts}
            rowClassName="h-12"
            sorting={table.sorting}
            onSortChange={table.onSortChange}
            onRowClick={(post) =>
              void navigate({ to: "/posts/$reportId", params: { reportId: post.id } })
            }
            emptyState={
              <EmptyState
                title={emptyTitle(search)}
                description={
                  filtered
                    ? "No post matches these filters. Change the status or clear the search."
                    : "No post has been written yet."
                }
              />
            }
            footer={
              <TablePagination
                search={search}
                dropped={dropped}
                isFirstPage={table.isFirstPage}
                mightHaveMore={table.mightHaveMore}
                isFetching={postsQuery.isFetching}
                onFirstPage={table.onFirstPage}
                onPreviousPage={table.onPreviousPage}
                onNextPage={table.onNextPage}
                onPageSize={table.onPageSize}
              />
            }
          />
        </>
      )}

      <PostConfirmDialog
        open={action?.kind === "approve"}
        title="Approve this post?"
        description={`"${action?.post.title ?? ""}" becomes visible in the Posts feed. There is no unapprove — only an edit by its author sends it back for review.`}
        confirmLabel="Approve"
        pending={approve.isPending}
        onConfirm={() => void runAction()}
        onCancel={() => setAction(null)}
      />

      <PostConfirmDialog
        open={action?.kind === "delete"}
        title="Delete this post?"
        description={`"${action?.post.title ?? ""}" is deleted permanently, along with its tags, voucher links, images and attachments. This cannot be undone.`}
        confirmLabel="Delete permanently"
        destructive
        pending={remove.isPending}
        onConfirm={() => void runAction()}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}

/** The empty state names the filter, so the default queue never reads as "no posts". */
function emptyTitle(search: PostSearch): string {
  if (search.status === "SUBMITTED") return "Nothing awaiting approval";
  if (search.status === "ALL") return "No posts";
  return `No ${POST_STATUS_LABELS[search.status].toLowerCase()} posts`;
}
