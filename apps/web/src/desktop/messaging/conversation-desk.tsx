import { conversationQueryOptions } from "@clc/api/features/messaging/queries";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { ActivityHeader } from "#/desktop/activity/activity-header";
import { HelpdeskDesk } from "#/desktop/messaging/helpdesk-desk";
import { MessagesDesk } from "#/desktop/messaging/messages-desk";
import { useDeskTrailLabel } from "#/desktop/trail";
import { useMessagingViewer } from "#/features/messaging/hooks/use-messaging-viewer";
import { messagingClient } from "#/lib/api/messaging";

/**
 * `/messages/$conversationId` on the desktop: Activity with that thread open.
 * A direct thread opens beside the Messages list; the helpdesk thread opens in
 * Helpdesk. Back returns to whichever inbox opened it.
 */
export function ConversationDesk({ conversationId }: { conversationId: number }) {
  const { t } = useLingui();
  const viewer = useMessagingViewer();
  // The thread pane polls this conversation; this only reads its kind and peer.
  const conversation = useQuery({
    ...conversationQueryOptions(messagingClient, viewer ?? "", conversationId),
    enabled: viewer !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  }).data;
  const helpdesk = conversation?.kind === "helpdesk";
  const peer = conversation?.peer;
  useDeskTrailLabel(
    conversation ? (helpdesk ? t`Support` : (peer?.username ?? peer?.address)) : null,
  );
  const header = (
    <ActivityHeader section={helpdesk ? "helpdesk" : "messages"} sections threadOpen />
  );
  return helpdesk ? (
    <HelpdeskDesk header={header} conversationId={conversationId} />
  ) : (
    <MessagesDesk header={header} conversationId={conversationId} />
  );
}
