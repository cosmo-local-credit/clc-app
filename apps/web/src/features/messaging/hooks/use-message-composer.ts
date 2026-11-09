import { backendRetryDelayMs, isRetryableBackendError } from "@clc/api/client/errors";
import { checkImageFile } from "@clc/api/features/images/policy";
import { appendThreadMessage, messagingKeys } from "@clc/api/features/messaging/queries";
import {
  buildMessageContent,
  MESSAGE_IMAGE_MAX,
  type SendMessageInput,
} from "@clc/core/features/messaging/logic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { useImageUpload } from "#/features/images/use-image-upload";
import { messagingClient } from "#/lib/api/messaging";
import { isStorageConfigured } from "#/lib/api/storage";
import { useMessagingViewer } from "./use-messaging-viewer";

export type ComposerImage = {
  /** The upload id, reused by the upload's own retry. */
  key: string;
  previewUrl: string;
  url: string | null;
  failed: boolean;
};

export type ComposerImageError = "unsupported" | "upload-failed";

/**
 * The composer's draft and its send, retry-safe end to end.
 *
 * The `clientId` is generated once per distinct content and reused by every
 * retry of that content, the mutation's own retries included, so a send whose
 * response was lost is stored once: clc-core answers a repeated `clientId` with
 * the stored message. Editing the draft after a failure gives it a new id.
 */
export function useMessageComposer(conversationId: number) {
  const viewer = useMessagingViewer();
  const queryClient = useQueryClient();
  const upload = useImageUpload();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [imageError, setImageError] = useState<ComposerImageError | null>(null);
  const pending = useRef<{ key: string; clientId: string } | null>(null);
  const previews = useRef(new Set<string>());

  const uploading = images.some((image) => image.url === null && !image.failed);
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

  const send = useMutation({
    mutationFn: (input: SendMessageInput) => messagingClient.send(conversationId, input),
    retry: (failureCount, error) => failureCount < 2 && isRetryableBackendError(error),
    retryDelay: (attempt, error) => backendRetryDelayMs(error, attempt),
    onSuccess: (message) => {
      const sentKey = pending.current?.key;
      pending.current = null;
      if (sentKey !== undefined && sentKey === currentKey.current) {
        setBody("");
        for (const image of images) dropPreview(image.previewUrl);
        setImages([]);
      }
      if (!viewer) return;
      appendThreadMessage(queryClient, messagingKeys.messages(viewer, conversationId), message);
      void queryClient.invalidateQueries({
        queryKey: messagingKeys.conversation(viewer, conversationId),
      });
      void queryClient.invalidateQueries({ queryKey: messagingKeys.lists(viewer) });
    },
  });

  function dropPreview(url: string) {
    URL.revokeObjectURL(url);
    previews.current.delete(url);
  }

  function submit() {
    if (!content || !contentKey || uploading || send.isPending) return;
    if (pending.current?.key !== contentKey) {
      pending.current = { key: contentKey, clientId: crypto.randomUUID() };
    }
    send.mutate({ clientId: pending.current.clientId, ...content });
  }

  async function addImage(file: File) {
    if (images.length >= MESSAGE_IMAGE_MAX) return;
    if (!checkImageFile(file).ok) {
      setImageError("unsupported");
      return;
    }
    setImageError(null);
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
      setImageError("upload-failed");
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
    imageError,
    addImage,
    removeImage,
    canAddImage: isStorageConfigured && images.length < MESSAGE_IMAGE_MAX,
    uploading,
    canSend: content !== null && !uploading && !send.isPending,
    submit,
    send,
  };
}
