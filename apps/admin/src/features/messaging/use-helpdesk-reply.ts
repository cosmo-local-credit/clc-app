import { backendRetryDelayMs, isRetryableBackendError } from "@clc/api/client/errors";
import { adminMessagingKeys, appendThreadMessage } from "@clc/api/features/messaging/queries";
import {
  buildMessageContent,
  MESSAGE_IMAGE_MAX,
  type SendMessageInput,
} from "@clc/core/features/messaging/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { adminMessaging } from "#/lib/messaging";
import { invalidateHelpdeskQueues } from "./use-helpdesk";

export type ReplyImage = {
  /** The upload id, reused by the upload's own retry. */
  key: string;
  previewUrl: string;
  url: string | null;
  failed: boolean;
};

/**
 * The reply draft and its send, retry-safe end to end.
 *
 * The `clientId` is generated once per distinct content and reused by every
 * retry of that content — the mutation's own retries and the operator pressing
 * Send again after a failure — so a reply whose response was lost is stored
 * once: clc-core answers a repeated `clientId` with the message it already
 * holds. Editing the draft after a failure makes it new content with a new id.
 *
 * Photo uploads are driven from outside (`ReplyPhotoButton`), because the
 * upload hook needs the storage client and is only mounted when one is
 * configured. This hook only holds their state.
 */
export function useHelpdeskReply(conversationId: number) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<ReplyImage[]>([]);
  const pending = useRef<{ key: string; clientId: string } | null>(null);
  const previews = useRef(new Set<string>());

  const uploading = images.some((image) => image.url === null && !image.failed);
  // A photo that did not upload blocks the send rather than being dropped from it.
  const imageFailed = images.some((image) => image.failed);
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
    mutationFn: (input: SendMessageInput) => adminMessaging.reply(conversationId, input),
    retry: (failureCount, error) => failureCount < 2 && isRetryableBackendError(error),
    retryDelay: (attempt, error) => backendRetryDelayMs(error, attempt),
    onSuccess: async (message) => {
      const sentKey = pending.current?.key;
      pending.current = null;
      // Clear only the draft that was sent: one typed while it was in flight stays.
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
        invalidateHelpdeskQueues(queryClient),
      ]);
    },
  });

  function submit() {
    if (!content || !contentKey || uploading || imageFailed || send.isPending) return;
    if (pending.current?.key !== contentKey) {
      pending.current = { key: contentKey, clientId: crypto.randomUUID() };
    }
    send.mutate({ clientId: pending.current.clientId, ...content });
  }

  function startImage(previewUrl: string): string {
    const key = crypto.randomUUID().replaceAll("-", "");
    previews.current.add(previewUrl);
    setImages((current) => [...current, { key, previewUrl, url: null, failed: false }]);
    return key;
  }

  function finishImage(key: string, url: string | null) {
    setImages((current) =>
      current.map((image) => (image.key === key ? { ...image, url, failed: url === null } : image)),
    );
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
    startImage,
    finishImage,
    removeImage,
    hasRoomForImage: images.length < MESSAGE_IMAGE_MAX,
    imageFailed,
    uploading,
    canSend: content !== null && !uploading && !imageFailed && !send.isPending,
    submit,
    send,
  };
}

export type HelpdeskReply = ReturnType<typeof useHelpdeskReply>;
