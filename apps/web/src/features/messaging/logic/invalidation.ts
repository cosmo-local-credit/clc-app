import { messagingKeys } from "@clc/api/features/messaging/queries";
import type { QueryClient } from "@tanstack/react-query";

/**
 * What a realtime event refreshes (docs/MESSAGING.md, In the app).
 *
 * Either event refreshes the unread counts and the conversation lists. An
 * inbox change carries no conversation id, so it refreshes whichever thread is
 * open; a messaging sync refreshes only the thread it names. A thread refresh
 * is one `after=<newest id>` call, so the broad case stays cheap.
 */
export function invalidateForMessagingEvent(
  queryClient: QueryClient,
  viewer: string,
  event: { kind: "inbox" } | { kind: "messaging"; conversationId: number | null },
): Promise<unknown> {
  const work = [
    queryClient.invalidateQueries({ queryKey: messagingKeys.unread(viewer) }),
    queryClient.invalidateQueries({ queryKey: messagingKeys.lists(viewer) }),
  ];
  if (event.kind === "inbox") {
    work.push(
      queryClient.invalidateQueries({
        queryKey: [...messagingKeys.viewer(viewer), "thread"],
        refetchType: "active",
      }),
    );
  } else if (event.conversationId !== null) {
    work.push(
      queryClient.invalidateQueries({
        queryKey: messagingKeys.thread(viewer, event.conversationId),
      }),
    );
  }
  return Promise.all(work);
}
