import { messagingKeys, postRequestsQueryOptions } from "@clc/api/features/messaging/queries";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { messagingClient } from "#/lib/api/messaging";
import { useMessagingViewer } from "./use-messaging-viewer";

export function usePostRequests() {
  const viewer = useMessagingViewer();
  const query = useInfiniteQuery({
    ...postRequestsQueryOptions(messagingClient, viewer ?? ""),
    enabled: Boolean(viewer),
    refetchInterval: 30_000,
  });
  return {
    ...query,
    viewer,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}

function useRefreshPostRequests() {
  const viewer = useMessagingViewer();
  const queryClient = useQueryClient();
  return () => {
    if (!viewer) return;
    void queryClient.invalidateQueries({ queryKey: messagingKeys.postRequests(viewer) });
    void queryClient.invalidateQueries({ queryKey: messagingKeys.unread(viewer) });
    void queryClient.invalidateQueries({ queryKey: messagingKeys.lists(viewer) });
  };
}

export function useRequestPostContact(postId: string) {
  const refresh = useRefreshPostRequests();
  return useMutation({
    mutationFn: (intro: string) =>
      messagingClient.requestPostContact({ postId, intro: intro.trim() || undefined }),
    onSuccess: refresh,
  });
}

export function useSetPostRequestStatus() {
  const refresh = useRefreshPostRequests();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "declined" }) =>
      messagingClient.setPostRequestStatus(id, status),
    onSuccess: refresh,
  });
}
