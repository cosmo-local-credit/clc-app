import type { ManagedReportSummary } from "@clc/api/features/reports/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { DeskTable, type DeskColumn } from "#/desktop/ui/data-table";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { useMyPosts } from "#/features/posts/hooks/use-my-posts";
import { PostStatusBadge } from "#/features/posts/ui/post-status-badge";
import { formatReportDate } from "#/lib/report-display";

export function MyPostsDesk() {
  const { t, i18n } = useLingui();
  const postsQuery = useMyPosts();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const posts = postsQuery.data?.reports ?? [];

  const columns: DeskColumn<ManagedReportSummary>[] = [
    {
      id: "title",
      header: <Trans>Title</Trans>,
      width: "1.6fr",
      sortValue: (row) => row.title,
      cell: (row) => row.title,
    },
    {
      id: "status",
      header: <Trans>Status</Trans>,
      width: "10rem",
      sortValue: (row) => row.status,
      cell: (row) => <PostStatusBadge status={row.status} />,
    },
    {
      id: "updated",
      header: <Trans>Updated</Trans>,
      width: "9rem",
      align: "end",
      sortValue: (row) => row.updatedAt ?? "",
      cell: (row) => (
        <time dateTime={row.updatedAt ?? undefined} className="font-mono">
          {formatReportDate(row.updatedAt, locale)}
        </time>
      ),
    },
  ];

  return (
    <DeskCanvas width="full">
      <div className="mb-6 flex items-center justify-between gap-3">
        <DeskTitle>
          <Trans>My posts</Trans>
        </DeskTitle>
        <Button asChild>
          <Link to="/posts/new">
            <Trans>New post</Trans>
          </Link>
        </Button>
      </div>

      {postsQuery.isPending ? (
        <p className="text-sm text-muted-foreground" aria-busy="true">
          <Trans>Loading your posts…</Trans>
        </p>
      ) : null}

      {postsQuery.isError ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            <Trans>Couldn't load your posts.</Trans>
          </p>
          <Button
            variant="outline"
            pending={postsQuery.isFetching}
            onClick={() => void postsQuery.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      {postsQuery.data && posts.length === 0 ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            <Trans>You haven't written any posts yet.</Trans>
          </p>
          <Button asChild variant="outline">
            <Link to="/posts/new">
              <Trans>Write your first post</Trans>
            </Link>
          </Button>
        </div>
      ) : null}

      {posts.length > 0 ? (
        <DeskTable
          label={t`My posts`}
          rows={posts}
          columns={columns}
          rowKey={(row) => row.id}
          renderRow={(row, rowProps, cells) =>
            row.status === "APPROVED" ? (
              <Link to="/posts/$reportId" params={{ reportId: row.id }} {...rowProps}>
                {cells}
              </Link>
            ) : (
              <Link to="/posts/$reportId/edit" params={{ reportId: row.id }} {...rowProps}>
                {cells}
              </Link>
            )
          }
        />
      ) : null}
    </DeskCanvas>
  );
}
