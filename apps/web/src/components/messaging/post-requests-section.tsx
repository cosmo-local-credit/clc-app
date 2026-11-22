import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { SectionHeading } from "#/components/ui/section-heading";
import {
  useSetPostRequestStatus,
  type usePostRequests,
} from "#/features/messaging/hooks/use-post-requests";

export function PostRequestsSection({ list }: { list: ReturnType<typeof usePostRequests> }) {
  const respond = useSetPostRequestStatus();
  if (!list.viewer || (!list.isError && list.items.length === 0)) return null;
  return (
    <section className="space-y-2 border border-border bg-card p-3">
      <SectionHeading>
        <Trans>Post requests</Trans>
      </SectionHeading>
      {list.items.map((item) => (
        <div key={item.id} className="space-y-2 border-t border-border pt-2">
          <Link
            className="block break-words text-sm font-medium underline underline-offset-2"
            to="/posts/$reportId"
            params={{ reportId: item.postId }}
          >
            <Trans>Post: {item.postTitle}</Trans>
          </Link>
          {item.requester ? (
            <p className="break-all font-mono text-xs text-muted-foreground" dir="ltr">
              {item.requester.username ?? item.requester.address}
            </p>
          ) : null}
          {item.intro ? (
            <p dir="auto" className="break-words text-sm">
              {item.intro}
            </p>
          ) : null}
          {item.status === "accepted" && item.conversationId !== null ? (
            <Button asChild variant="outline" tap>
              <Link
                to="/messages/$conversationId"
                params={{ conversationId: String(item.conversationId) }}
              >
                <Trans>Open conversation</Trans>
              </Link>
            </Button>
          ) : item.status === "declined" ? (
            <p className="text-xs text-muted-foreground">
              <Trans>Declined</Trans>
            </p>
          ) : item.status === "accepted" ? (
            <p className="text-xs text-muted-foreground">
              <Trans>Closed</Trans>
            </p>
          ) : item.direction === "incoming" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                tap
                pending={
                  respond.isPending &&
                  respond.variables?.id === item.id &&
                  respond.variables.status === "accepted"
                }
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: item.id, status: "accepted" })}
              >
                <Trans>Accept</Trans>
              </Button>
              <Button
                variant="outline"
                tap
                pending={
                  respond.isPending &&
                  respond.variables?.id === item.id &&
                  respond.variables.status === "declined"
                }
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: item.id, status: "declined" })}
              >
                <Trans>Decline</Trans>
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              <Trans>Pending</Trans>
            </p>
          )}
          {respond.isError && respond.variables?.id === item.id ? (
            <p role="alert" className="text-xs text-destructive">
              <Trans>Couldn't update the request. Try again.</Trans>
            </p>
          ) : null}
        </div>
      ))}
      {list.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-muted-foreground">
            <Trans>Couldn't load Post requests.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={list.isFetching}
            onClick={() => void list.refetch()}
          >
            <Trans>Retry</Trans>
          </Button>
        </div>
      ) : null}
      {list.hasNextPage ? (
        <Button
          variant="outline"
          tap
          pending={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </section>
  );
}
