import { messagingKeys } from "@clc/api/features/messaging/queries";
import type { Conversation } from "@clc/core/features/messaging/logic";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import {
  notificationActivityContext,
  type NotificationActivitySource,
} from "../logic/activity-context";
import { messageThreadConversationId } from "../logic/target-url";

/** Read live route/query state; navigation never restarts the notification connection. */
export function createNotificationActivitySource(
  router: AnyRouter,
  queryClient: QueryClient,
  walletAddress: string,
): NotificationActivitySource {
  return {
    current: () => {
      const location = router.state.resolvedLocation ?? router.state.location;
      const conversationId = messageThreadConversationId(location.pathname);
      const conversation =
        conversationId === null
          ? undefined
          : queryClient.getQueryData<Conversation>(
              messagingKeys.conversation(walletAddress, conversationId),
            );
      return notificationActivityContext(location, conversation?.kind);
    },
    subscribe: (listener) => {
      const stopRouter = router.subscribe("onResolved", listener);
      const stopQuery = queryClient.getQueryCache().subscribe(() => {
        if (messageThreadConversationId(router.state.location.pathname) !== null) listener();
      });
      return () => {
        stopRouter();
        stopQuery();
      };
    },
  };
}
