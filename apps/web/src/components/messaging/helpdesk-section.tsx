import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { RiCustomerService2Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { useStartHelpdesk } from "#/features/messaging/hooks/use-conversation-actions";
import { useConversationList } from "#/features/messaging/hooks/use-conversation-list";
import { ConversationRow } from "./conversation-row";

/**
 * Activity's Helpdesk: the caller's one conversation with Support, or a way to
 * start it. Replies show as Support, whichever admin wrote them.
 */
export function HelpdeskSection() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const list = useConversationList("helpdesk");
  const start = useStartHelpdesk();
  const conversation = list.conversations[0];
  return (
    <div className="space-y-3">
      {list.isPending && list.fetchStatus !== "idle" ? (
        <ListSkeleton label={<Trans>Loading helpdesk…</Trans>} count={1} />
      ) : null}
      {list.isError && !list.data ? (
        <div className="space-y-2 border border-border bg-card p-3">
          <p role="alert" className="text-muted-foreground text-sm">
            <Trans>Couldn't load the helpdesk.</Trans>
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
      {conversation ? (
        <section className="border border-border bg-card" aria-label={t`Helpdesk`}>
          <ConversationRow conversation={conversation} isLast />
        </section>
      ) : null}
      {list.isSuccess && !conversation ? (
        <div className="space-y-2">
          <Button
            tap
            className="w-full"
            pending={start.isPending}
            onClick={() =>
              start.mutate(undefined, {
                onSuccess: (started) =>
                  void navigate({
                    to: "/messages/$conversationId",
                    params: { conversationId: String(started.id) },
                  }),
              })
            }
          >
            <RiCustomerService2Line aria-hidden="true" />
            <Trans>Contact support</Trans>
          </Button>
          {start.isError ? (
            <p role="alert" className="text-destructive text-xs">
              <Trans>Couldn't reach Support. Try again.</Trans>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
