import {
  type AbuseReportStatus,
  type ConversationKind,
  type HelpdeskStatus,
  mergeMessages,
  newestMessageId,
  type ThreadMessages,
} from "@clc/core/features/messaging/logic";
import {
  infiniteQueryOptions,
  type QueryClient,
  type QueryKey,
  queryOptions,
} from "@tanstack/react-query";

import type { AdminMessagingClient, MessagePageParams, MessagingClient } from "./client";

/** Newest messages a thread opens on, and each older page it loads after that. */
const THREAD_PAGE_SIZE = 50;
/** One forward read is a single `after=` call; a long backlog takes a few. */
const FORWARD_PAGE_SIZE = 100;
const MAX_FORWARD_PAGES = 5;

/**
 * Everything is keyed by the signed-in address: read state, blocks and the
 * conversation list belong to the caller, so another account on this device
 * must never see them from the cache.
 */
export const messagingKeys = {
  all: ["clc", "messaging"] as const,
  viewer: (viewer: string) => [...messagingKeys.all, viewer.toLowerCase()] as const,
  unread: (viewer: string) => [...messagingKeys.viewer(viewer), "unread"] as const,
  lists: (viewer: string) => [...messagingKeys.viewer(viewer), "list"] as const,
  list: (viewer: string, kind: ConversationKind) => [...messagingKeys.lists(viewer), kind] as const,
  thread: (viewer: string, id: number) => [...messagingKeys.viewer(viewer), "thread", id] as const,
  conversation: (viewer: string, id: number) =>
    [...messagingKeys.thread(viewer, id), "conversation"] as const,
  messages: (viewer: string, id: number) =>
    [...messagingKeys.thread(viewer, id), "messages"] as const,
  blocks: (viewer: string) => [...messagingKeys.viewer(viewer), "blocks"] as const,
};

/** The admin queues live under their own root so a user-side invalidation never touches them. */
export const adminMessagingKeys = {
  all: ["clc", "admin-messaging"] as const,
  counts: () => [...adminMessagingKeys.all, "counts"] as const,
  helpdeskQueue: (status?: HelpdeskStatus) =>
    [...adminMessagingKeys.all, "helpdesk", "queue", status ?? "all"] as const,
  helpdeskThread: (id: number) => [...adminMessagingKeys.all, "helpdesk", "thread", id] as const,
  helpdeskItem: (id: number) => [...adminMessagingKeys.helpdeskThread(id), "item"] as const,
  helpdeskMessages: (id: number) => [...adminMessagingKeys.helpdeskThread(id), "messages"] as const,
  abuseReports: (status?: AbuseReportStatus) =>
    [...adminMessagingKeys.all, "abuse-reports", status ?? "all"] as const,
};

type FetchMessagePage<M extends { id: number }> = (
  params: MessagePageParams,
  signal?: AbortSignal,
) => Promise<{ items: M[]; hasMore: boolean }>;

/**
 * A thread's refresh: the newest page until a read has returned a message,
 * and afterwards only what is newer than the newest message a read returned,
 * through `after=<fetchedThrough>`. Messages the caller sent are not a cursor.
 *
 * Message ids rise in commit order within a conversation, so the forward read
 * cannot skip one. The result is merged by id with whatever the cache holds
 * when it lands, so an older page or a sent message written meanwhile is kept.
 * Only a server read decides `hasOlder`: the newest page here, an older page
 * in `loadOlderThreadMessages`.
 */
async function refreshThreadMessages<M extends { id: number }>(
  client: QueryClient,
  queryKey: QueryKey,
  fetchPage: FetchMessagePage<M>,
  signal: AbortSignal,
): Promise<ThreadMessages<M>> {
  const cursor = client.getQueryData<ThreadMessages<M>>(queryKey)?.fetchedThrough;
  let fetched: M[] = [];
  let newestPageHasOlder: boolean | undefined;
  if (cursor === undefined) {
    const page = await fetchPage({ limit: THREAD_PAGE_SIZE }, signal);
    fetched = page.items;
    newestPageHasOlder = page.hasMore;
  } else {
    let after = cursor;
    for (let index = 0; index < MAX_FORWARD_PAGES; index++) {
      const page = await fetchPage({ after, limit: FORWARD_PAGE_SIZE }, signal);
      fetched = mergeMessages(fetched, page.items);
      after = newestMessageId(page.items) ?? after;
      if (!page.hasMore || page.items.length === 0) break;
    }
  }
  const latest = client.getQueryData<ThreadMessages<M>>(queryKey);
  const held = latest?.fetchedThrough ?? cursor;
  const newest = newestMessageId(fetched);
  return {
    items: mergeMessages(latest?.items ?? [], fetched),
    hasOlder: newestPageHasOlder ?? latest?.hasOlder ?? false,
    fetchedThrough:
      newest === undefined || held === undefined ? (newest ?? held) : Math.max(held, newest),
  };
}

/** Prepends the page before the oldest message held. Resolves to whether older ones remain. */
async function loadOlderThreadMessages<M extends { id: number }>(
  client: QueryClient,
  queryKey: QueryKey,
  fetchPage: FetchMessagePage<M>,
): Promise<boolean> {
  const current = client.getQueryData<ThreadMessages<M>>(queryKey);
  const oldest = current?.items[0]?.id;
  if (!current || oldest === undefined || !current.hasOlder) return false;
  const page = await fetchPage({ before: oldest, limit: THREAD_PAGE_SIZE });
  client.setQueryData<ThreadMessages<M>>(queryKey, (latest) => ({
    ...latest,
    items: mergeMessages(page.items, latest?.items ?? []),
    hasOlder: page.hasMore,
  }));
  return page.hasMore;
}

/**
 * Appends one message the caller just sent, so it shows before the next poll.
 * It moves neither the forward cursor nor `hasOlder`: those come from reads.
 */
export function appendThreadMessage<M extends { id: number }>(
  client: QueryClient,
  queryKey: QueryKey,
  message: M,
): void {
  client.setQueryData<ThreadMessages<M>>(queryKey, (current) => ({
    ...current,
    items: mergeMessages(current?.items ?? [], [message]),
    hasOlder: current?.hasOlder ?? false,
  }));
}

export function conversationUnreadQueryOptions(messaging: MessagingClient, viewer: string) {
  return queryOptions({
    queryKey: messagingKeys.unread(viewer),
    queryFn: ({ signal }) => messaging.unread(signal),
  });
}

export function conversationListInfiniteQueryOptions(
  messaging: MessagingClient,
  viewer: string,
  kind: ConversationKind,
) {
  return infiniteQueryOptions({
    queryKey: messagingKeys.list(viewer, kind),
    queryFn: ({ pageParam, signal }) => messaging.list({ kind, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function conversationQueryOptions(messaging: MessagingClient, viewer: string, id: number) {
  return queryOptions({
    queryKey: messagingKeys.conversation(viewer, id),
    queryFn: ({ signal }) => messaging.get(id, signal),
  });
}

export function conversationMessagesQueryOptions(
  messaging: MessagingClient,
  viewer: string,
  id: number,
) {
  const queryKey = messagingKeys.messages(viewer, id);
  return queryOptions({
    queryKey,
    queryFn: ({ client, signal }) =>
      refreshThreadMessages(
        client,
        queryKey,
        (params, s) => messaging.messages(id, params, s),
        signal,
      ),
  });
}

export function loadOlderConversationMessages(
  messaging: MessagingClient,
  client: QueryClient,
  viewer: string,
  id: number,
): Promise<boolean> {
  return loadOlderThreadMessages(client, messagingKeys.messages(viewer, id), (params) =>
    messaging.messages(id, params),
  );
}

// Admin console.

export function adminHelpdeskQueueInfiniteQueryOptions(
  admin: AdminMessagingClient,
  status?: HelpdeskStatus,
) {
  return infiniteQueryOptions({
    queryKey: adminMessagingKeys.helpdeskQueue(status),
    queryFn: ({ pageParam, signal }) => admin.helpdeskQueue({ status, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function adminHelpdeskItemQueryOptions(admin: AdminMessagingClient, id: number) {
  return queryOptions({
    queryKey: adminMessagingKeys.helpdeskItem(id),
    queryFn: ({ signal }) => admin.helpdeskItem(id, signal),
  });
}

export function adminHelpdeskMessagesQueryOptions(admin: AdminMessagingClient, id: number) {
  const queryKey = adminMessagingKeys.helpdeskMessages(id);
  return queryOptions({
    queryKey,
    queryFn: ({ client, signal }) =>
      refreshThreadMessages(
        client,
        queryKey,
        (params, s) => admin.helpdeskMessages(id, params, s),
        signal,
      ),
  });
}

export function loadOlderAdminHelpdeskMessages(
  admin: AdminMessagingClient,
  client: QueryClient,
  id: number,
): Promise<boolean> {
  return loadOlderThreadMessages(client, adminMessagingKeys.helpdeskMessages(id), (params) =>
    admin.helpdeskMessages(id, params),
  );
}

export function adminMessagingCountsQueryOptions(admin: AdminMessagingClient) {
  return queryOptions({
    queryKey: adminMessagingKeys.counts(),
    queryFn: ({ signal }) => admin.counts(signal),
  });
}

export function adminAbuseReportsInfiniteQueryOptions(
  admin: AdminMessagingClient,
  status?: AbuseReportStatus,
) {
  return infiniteQueryOptions({
    queryKey: adminMessagingKeys.abuseReports(status),
    queryFn: ({ pageParam, signal }) => admin.abuseReports({ status, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
