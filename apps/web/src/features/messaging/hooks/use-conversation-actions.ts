import { messagingKeys } from "@clc/api/features/messaging/queries";
import type {
  AbuseReportInput,
  Conversation,
  ConversationRequestInput,
  DirectStatusChange,
} from "@clc/core/features/messaging/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { messagingClient } from "#/lib/api/messaging";
import { useMessagingViewer } from "./use-messaging-viewer";

function useRefreshMessaging() {
  const viewer = useMessagingViewer();
  const queryClient = useQueryClient();
  return (conversation?: Conversation) => {
    if (!viewer) return;
    if (conversation) {
      queryClient.setQueryData(messagingKeys.conversation(viewer, conversation.id), conversation);
    }
    void queryClient.invalidateQueries({ queryKey: messagingKeys.unread(viewer) });
    void queryClient.invalidateQueries({ queryKey: messagingKeys.lists(viewer) });
  };
}

/** Accept, decline or revoke. The returned conversation replaces the cached one. */
export function useSetConversationStatus(conversationId: number) {
  const refresh = useRefreshMessaging();
  return useMutation({
    mutationFn: (status: DirectStatusChange) => messagingClient.setStatus(conversationId, status),
    onSuccess: (conversation) => refresh(conversation),
  });
}

/** Asks someone found by recipient search to talk. Resolves to the new conversation. */
export function useRequestConversation() {
  const refresh = useRefreshMessaging();
  return useMutation({
    mutationFn: (input: ConversationRequestInput) => messagingClient.request(input),
    onSuccess: (conversation) => refresh(conversation),
  });
}

/** Opens (or returns) the caller's helpdesk conversation. */
export function useStartHelpdesk() {
  const refresh = useRefreshMessaging();
  return useMutation({
    mutationFn: () => messagingClient.helpdesk(),
    onSuccess: (conversation) => refresh(conversation),
  });
}

/** Blocks or unblocks a conversation's peer, then rereads the conversation. */
export function useBlockPeer(conversationId: number) {
  const viewer = useMessagingViewer();
  const queryClient = useQueryClient();
  const refresh = useRefreshMessaging();
  return useMutation({
    mutationFn: ({ address, blocked }: { address: string; blocked: boolean }) =>
      blocked ? messagingClient.block(address) : messagingClient.unblock(address),
    onSuccess: () => {
      refresh();
      if (!viewer) return;
      void queryClient.invalidateQueries({ queryKey: messagingKeys.blocks(viewer) });
      void queryClient.invalidateQueries({
        queryKey: messagingKeys.conversation(viewer, conversationId),
      });
    },
  });
}

export function useReportPeer() {
  return useMutation({
    mutationFn: (input: AbuseReportInput) => messagingClient.report(input),
  });
}
