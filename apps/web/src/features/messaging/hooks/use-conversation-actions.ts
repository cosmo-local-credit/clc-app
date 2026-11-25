import { messagingKeys } from "@clc/api/features/messaging/queries";
import type {
  AbuseReportInput,
  Conversation,
  ConversationRequestInput,
  DirectStatusChange,
} from "@clc/core/features/messaging/logic";
import { type InfiniteData, useMutation, useQueryClient } from "@tanstack/react-query";

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

export function useDeleteConversation(conversationId: number) {
  const viewer = useMessagingViewer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => messagingClient.delete(conversationId),
    onMutate: () => ({ viewer }),
    onSuccess: async (_result, _variables, context) => {
      if (!context.viewer) return;
      const thread = messagingKeys.thread(context.viewer, conversationId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: thread }),
        queryClient.cancelQueries({ queryKey: messagingKeys.lists(context.viewer) }),
        queryClient.cancelQueries({ queryKey: messagingKeys.postRequests(context.viewer) }),
      ]);
      queryClient.removeQueries({ queryKey: thread });
      queryClient.setQueryData<InfiniteData<Awaited<ReturnType<typeof messagingClient.list>>>>(
        messagingKeys.list(context.viewer, "direct"),
        (current) =>
          current && {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.id !== conversationId),
            })),
          },
      );
      queryClient.setQueryData<
        InfiniteData<Awaited<ReturnType<typeof messagingClient.postRequests>>>
      >(
        [...messagingKeys.postRequests(context.viewer), "list"],
        (current) =>
          current && {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.filter((item) => item.conversationId !== conversationId),
            })),
          },
      );
      void queryClient.invalidateQueries({ queryKey: messagingKeys.lists(context.viewer) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.unread(context.viewer) });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.postRequests(context.viewer) });
    },
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
