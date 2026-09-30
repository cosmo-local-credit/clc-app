import type { ManagedReportSummary } from "@clc/api/features/reports/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { BackChevron } from "#/components/wallet";
import { useMyPosts } from "#/features/posts/hooks/use-my-posts";
import { formatReportDate } from "#/lib/report-display";
import { PostStatusBadge } from "./post-status-badge";

/**
 * Everything the signed-in author has written, in any status.
 *
 * The Posts feed cannot show this: it returns approved posts only, which is why
 * an author had no way to find a post they had just submitted.
 *
 * A pending row links to the owner edit route rather than the public detail
 * route, which would answer 404 for it. An approved row offers both.
 */
export function MyPostsPage() {
  const { t, i18n } = useLingui();
  const postsQuery = useMyPosts();

  return (
    <div className="space-y-4">
      <BackChevron label={t`Posts`} to="/" search={{ tab: "posts" }} />

      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>My posts</Trans>
        </h1>
        <Button asChild size="sm" className="h-9 shrink-0">
          <Link to="/posts/new">
            <Trans>New post</Trans>
          </Link>
        </Button>
      </div>

      {postsQuery.isPending ? (
        <div aria-busy="true" aria-label={t`Loading your posts…`} className="space-y-2">
          <Skeleton className="h-[6.5rem] w-full rounded-none" />
          <Skeleton className="h-[6.5rem] w-full rounded-none" />
        </div>
      ) : null}

      {postsQuery.isError ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-muted-foreground text-sm">
            <Trans>Couldn't load your posts.</Trans>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-9 bg-card"
            onClick={() => postsQuery.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}

      {postsQuery.data && postsQuery.data.reports.length === 0 ? (
        <div className="space-y-3 border border-border bg-card p-4">
          <p className="text-muted-foreground text-sm">
            <Trans>You haven't written any posts yet.</Trans>
          </p>
          <Button asChild variant="outline" size="sm" className="h-9 bg-card">
            <Link to="/posts/new">
              <Trans>Write your first post</Trans>
            </Link>
          </Button>
        </div>
      ) : null}

      {postsQuery.data && postsQuery.data.reports.length > 0 ? (
        <ul aria-label={t`My posts`} className="space-y-2">
          {postsQuery.data.reports.map((post) => (
            <MyPostRow key={post.id} post={post} locale={i18n.locales?.[0] ?? i18n.locale} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MyPostRow({ post, locale }: { post: ManagedReportSummary; locale: string }) {
  const updated = formatReportDate(post.updatedAt, locale);

  return (
    <li className="space-y-2 border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 font-heading text-base font-semibold leading-snug [overflow-wrap:anywhere]">
          {post.title}
        </p>
        <PostStatusBadge status={post.status} />
      </div>

      {updated && post.updatedAt ? (
        <p className="text-muted-foreground text-xs">
          <Trans>Updated</Trans> <time dateTime={post.updatedAt}>{updated}</time>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {/* Only an approved post has a public detail page; anything else
            answers 404 there. */}
        {post.status === "APPROVED" ? (
          <Button asChild variant="outline" size="sm" className="h-9 bg-card">
            <Link to="/posts/$reportId" params={{ reportId: post.id }}>
              <Trans>View</Trans>
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm" className="h-9 bg-card">
          <Link to="/posts/$reportId/edit" params={{ reportId: post.id }}>
            <Trans>Edit</Trans>
          </Link>
        </Button>
      </div>
    </li>
  );
}
