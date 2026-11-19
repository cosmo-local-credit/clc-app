import { backendRetryDelayMs, isRetryableBackendError } from "@clc/api/client/errors";
import { checkImageFile } from "@clc/api/features/images/policy";
import {
  adminHelpdeskItemQueryOptions,
  adminHelpdeskMessagesQueryOptions,
  adminHelpdeskQueueInfiniteQueryOptions,
  adminMessagingKeys,
  appendThreadMessage,
  loadOlderAdminHelpdeskMessages,
} from "@clc/api/features/messaging/queries";
import {
  buildMessageContent,
  MESSAGE_IMAGE_MAX,
  type HelpdeskStatus,
  type SendMessageInput,
} from "@clc/core/features/messaging/logic";
import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useImageUpload } from "#/features/images/use-image-upload";
import { adminMessagingClient } from "#/lib/api/messaging";
import { isStorageConfigured } from "#/lib/api/storage";

const QUEUE_POLL_MS = 30_000;
const THREAD_POLL_MS = 5_000;
const POLLING = {
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;

function invalidateOperatorHelpdesk(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: [...adminMessagingKeys.all, "helpdesk", "queue"],
    }),
    queryClient.invalidateQueries({ queryKey: adminMessagingKeys.counts() }),
  ]);
}

export function useOperatorHelpdeskCount(enabled: boolean) {
  return useQuery({
    queryKey: adminMessagingKeys.counts(),
    queryFn: ({ signal }) => adminMessagingClient.counts(signal),
    ...POLLING,
    refetchInterval: QUEUE_POLL_MS,
    enabled,
  });
}

export function useOperatorHelpdeskQueue(status: HelpdeskStatus) {
  return useInfiniteQuery({
    ...adminHelpdeskQueueInfiniteQueryOptions(adminMessagingClient, status),
    ...POLLING,
    refetchInterval: QUEUE_POLL_MS,
  });
}

export function useOperatorHelpdeskThread(id: number) {
  const item = useQuery({
    ...adminHelpdeskItemQueryOptions(adminMessagingClient, id),
    ...POLLING,
    refetchInterval: THREAD_POLL_MS,
  });
  const messages = useQuery({
    ...adminHelpdeskMessagesQueryOptions(adminMessagingClient, id),
    ...POLLING,
    refetchInterval: THREAD_POLL_MS,
  });
  const queryClient = useQueryClient();
  const loadOlder = useMutation({
    mutationFn: () => loadOlderAdminHelpdeskMessages(adminMessagingClient, queryClient, id),
  });
  const setStatus = useMutation({
    mutationFn: (status: HelpdeskStatus) => adminMessagingClient.setHelpdeskStatus(id, status),
    onSuccess: async (next) => {
      queryClient.setQueryData(adminMessagingKeys.helpdeskItem(id), next);
      await invalidateOperatorHelpdesk(queryClient);
    },
  });
  return { item, messages, loadOlder, setStatus };
}

type ReplyImage = {
  key: string;
  previewUrl: string;
  url: string | null;
  failed: boolean;
};

export function useOperatorHelpdeskReply(conversationId: number) {
  const queryClient = useQueryClient();
  const upload = useImageUpload();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<ReplyImage[]>([]);
  const [unsupported, setUnsupported] = useState(false);
  const pending = useRef<{ key: string; clientId: string } | null>(null);
  const previews = useRef(new Set<string>());

  const uploading = images.some((image) => image.url === null && !image.failed);
  const uploadFailed = images.some((image) => image.failed);
  const content = buildMessageContent(
    body,
    images.flatMap((image) => (image.url ? [image.url] : [])),
  );
  const contentKey = content ? JSON.stringify(content) : null;
  const currentKey = useRef(contentKey);
  currentKey.current = contentKey;

  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  function dropPreview(url: string) {
    URL.revokeObjectURL(url);
    previews.current.delete(url);
  }

  const send = useMutation({
    mutationFn: (input: SendMessageInput) => adminMessagingClient.reply(conversationId, input),
    retry: (failureCount, error) => failureCount < 2 && isRetryableBackendError(error),
    retryDelay: (attempt, error) => backendRetryDelayMs(error, attempt),
    onSuccess: async (message) => {
      const sentKey = pending.current?.key;
      pending.current = null;
      if (sentKey !== undefined && sentKey === currentKey.current) {
        setBody("");
        setImages((current) => {
          for (const image of current) dropPreview(image.previewUrl);
          return [];
        });
      }
      appendThreadMessage(
        queryClient,
        adminMessagingKeys.helpdeskMessages(conversationId),
        message,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminMessagingKeys.helpdeskItem(conversationId),
        }),
        invalidateOperatorHelpdesk(queryClient),
      ]);
    },
  });

  function submit() {
    if (!content || !contentKey || uploading || uploadFailed || send.isPending) return;
    if (pending.current?.key !== contentKey) {
      pending.current = { key: contentKey, clientId: crypto.randomUUID() };
    }
    send.mutate({ clientId: pending.current.clientId, ...content });
  }

  async function addImage(file: File) {
    if (images.length >= MESSAGE_IMAGE_MAX) return;
    if (!checkImageFile(file).ok) {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    const key = crypto.randomUUID().replaceAll("-", "");
    const previewUrl = URL.createObjectURL(file);
    previews.current.add(previewUrl);
    setImages((current) => [...current, { key, previewUrl, url: null, failed: false }]);
    try {
      const stored = await upload.mutateAsync({ file, purpose: "message.image", uploadId: key });
      setImages((current) =>
        current.map((image) => (image.key === key ? { ...image, url: stored.url } : image)),
      );
    } catch {
      setImages((current) =>
        current.map((image) => (image.key === key ? { ...image, failed: true } : image)),
      );
    }
  }

  function removeImage(key: string) {
    setImages((current) => {
      const removed = current.find((image) => image.key === key);
      if (removed) dropPreview(removed.previewUrl);
      return current.filter((image) => image.key !== key);
    });
  }

  return {
    body,
    setBody,
    images,
    imageError: uploadFailed ? "upload-failed" : unsupported ? "unsupported" : null,
    addImage,
    removeImage,
    canAddImage: isStorageConfigured && images.length < MESSAGE_IMAGE_MAX,
    uploading,
    canSend: content !== null && !uploading && !uploadFailed && !send.isPending,
    submit,
    send,
  };
}
