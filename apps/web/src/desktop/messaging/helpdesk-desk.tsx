import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiCustomerService2Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { DeskInboxFrame } from "#/desktop/messaging/inbox-frame";
import { ThreadDesk } from "#/desktop/messaging/thread-desk";
import { DeskCanvas } from "#/desktop/ui/page";
import { useStartHelpdesk } from "#/features/messaging/hooks/use-conversation-actions";
import { useConversationList } from "#/features/messaging/hooks/use-conversation-list";

/**
 * Activity's Helpdesk. A person has one conversation with Support, so the
 * section is that thread, open in the panel; before the first message it is a
 * way to start it. Replies show as Support, whichever admin wrote them.
 */
export function HelpdeskDesk({
  header,
  conversationId,
}: {
  header: ReactNode;
  /** The thread a `/messages/$id` link named, when it is the helpdesk one. */
  conversationId?: number;
}) {
  const navigate = useNavigate();
  const list = useConversationList("helpdesk");
  const start = useStartHelpdesk();
  const openId = conversationId ?? list.conversations[0]?.id;

  if (openId !== undefined) {
    return (
      <DeskInboxFrame header={header}>
        <ThreadDesk key={openId} conversationId={openId} />
      </DeskInboxFrame>
    );
  }

  return (
    <DeskCanvas className="gap-4">
      {header}
      {list.isPending && list.fetchStatus !== "idle" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <Trans>Loading helpdesk…</Trans>
        </p>
      ) : null}
      {list.isError && !list.data ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className="text-sm text-muted-foreground">
            <Trans>Couldn't load the helpdesk.</Trans>
          </p>
          <Button variant="outline" pending={list.isFetching} onClick={() => void list.refetch()}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {list.isSuccess ? (
        <div className="grid justify-items-start gap-2">
          <Button
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
            <p role="alert" className="text-xs text-destructive">
              <Trans>Couldn't reach Support. Try again.</Trans>
            </p>
          ) : null}
        </div>
      ) : null}
    </DeskCanvas>
  );
}
