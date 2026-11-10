import {
  adminHelpdeskItemQueryOptions,
  adminHelpdeskMessagesQueryOptions,
  adminHelpdeskQueueInfiniteQueryOptions,
  adminMessagingCountsQueryOptions,
  adminMessagingKeys,
  loadOlderAdminHelpdeskMessages,
} from "@clc/api/features/messaging/queries";
import type { HelpdeskStatus } from "@clc/core/features/messaging/logic";
import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { adminMessaging } from "#/lib/messaging";

/** Admins get no push in v1 (docs/MESSAGING.md), so the queues refresh by polling. */
export const QUEUE_POLL_MS = 30_000;
/** An open thread polls `after=<newest id>`, as the user's side does. */
export const THREAD_POLL_MS = 5_000;

const POLLING = {
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;

/** Every status's queue: a reply or status change can move a conversation between them. */
export function invalidateHelpdeskQueues(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: [...adminMessagingKeys.all, "helpdesk", "queue"],
    }),
    queryClient.invalidateQueries({ queryKey: adminMessagingKeys.counts() }),
  ]);
}

/** The sidebar's helpdesk and abuse-report counters, polled like the queues. */
export function useAdminMessagingCounts() {
  return useQuery({
    ...adminMessagingCountsQueryOptions(adminMessaging),
    ...POLLING,
    refetchInterval: QUEUE_POLL_MS,
  });
}

export function useHelpdeskQueue(status: HelpdeskStatus) {
  return useInfiniteQuery({
    ...adminHelpdeskQueueInfiniteQueryOptions(adminMessaging, status),
    ...POLLING,
    refetchInterval: QUEUE_POLL_MS,
  });
}

export function useHelpdeskItem(id: number) {
  return useQuery({
    ...adminHelpdeskItemQueryOptions(adminMessaging, id),
    ...POLLING,
    refetchInterval: THREAD_POLL_MS,
  });
}

export function useHelpdeskMessages(id: number) {
  return useQuery({
    ...adminHelpdeskMessagesQueryOptions(adminMessaging, id),
    ...POLLING,
    refetchInterval: THREAD_POLL_MS,
  });
}

/** A mutation rather than a bare promise, so a reload waits for the page to land. */
export function useLoadOlderHelpdeskMessages(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => loadOlderAdminHelpdeskMessages(adminMessaging, queryClient, id),
  });
}

export function useHelpdeskStatus(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: HelpdeskStatus) => adminMessaging.setHelpdeskStatus(id, status),
    onSuccess: async (item) => {
      queryClient.setQueryData(adminMessagingKeys.helpdeskItem(id), item);
      await invalidateHelpdeskQueues(queryClient);
    },
  });
}
