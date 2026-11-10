import { Trans, useLingui } from "@lingui/react/macro";

import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { useConversationList } from "#/features/messaging/hooks/use-conversation-list";
import { ConversationRow } from "./conversation-row";
import { NewMessageSheet } from "./new-message-sheet";

/** Activity's Messages: requests waiting on the caller first, then every conversation. */
export function MessagesSection() {
  const { t } = useLingui();
  const list = useConversationList("direct");
  const requests = list.conversations.filter(
    (conversation) => conversation.status === "pending" && conversation.canAccept,
  );
  const others = list.conversations.filter((conversation) => !requests.includes(conversation));
  return (
    <div className="space-y-3">
      <NewMessageSheet existing={list.conversations} />
      {list.isPending && list.fetchStatus !== "idle" ? (
        <ListSkeleton label={<Trans>Loading messages…</Trans>} count={4} />
      ) : null}
      {list.isError && !list.data ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p role="alert" className="text-muted-foreground text-sm">
            <Trans>Couldn't load messages.</Trans>
          </p>
          <Button
            variant="outline"
            tap
            pending={list.isFetching}
            onClick={() => void list.refetch()}
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {list.isSuccess && list.conversations.length === 0 ? (
        <p className="border border-border bg-card p-3 text-muted-foreground text-sm">
          <Trans>No messages yet.</Trans>
        </p>
      ) : null}
      {requests.length > 0 ? (
        <section className="border border-border bg-card" aria-label={t`Message requests`}>
          {requests.map((conversation, index) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              isLast={index === requests.length - 1}
            />
          ))}
        </section>
      ) : null}
      {others.length > 0 ? (
        <section className="border border-border bg-card" aria-label={t`Conversations`}>
          {others.map((conversation, index) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              isLast={index === others.length - 1}
            />
          ))}
        </section>
      ) : null}
      {list.hasNextPage ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          <Trans>Load more</Trans>
        </Button>
      ) : null}
    </div>
  );
}
