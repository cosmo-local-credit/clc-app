import { checkImageFile } from "@clc/api/features/images/policy";
import { MESSAGE_BODY_MAX, MESSAGE_IMAGE_MAX } from "@clc/core/features/messaging/logic";
import { useRef, useState } from "react";
import { HiOutlinePhotograph, HiOutlineX } from "react-icons/hi";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { useImageUpload } from "#/features/images/use-image-upload";
import { errorMessage } from "#/lib/data-state";
import { isStorageConfigured } from "#/lib/storage";
import { type HelpdeskReply, useHelpdeskReply } from "../use-helpdesk-reply";

/**
 * The support reply: text and up to four photos. A failed send keeps the
 * draft, and sending it again reuses its `clientId`.
 */
export function ReplyComposer({ conversationId }: { conversationId: number }) {
  const reply = useHelpdeskReply(conversationId);
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <form
      aria-label="Reply"
      className="border-border bg-card space-y-3 border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        reply.submit();
      }}
    >
      {reply.images.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Photos to send">
          {reply.images.map((image, index) => (
            <li key={image.key} className="border-border relative size-20 border">
              <img
                src={image.previewUrl}
                alt={`Photo ${index + 1}${image.failed ? ", failed to upload" : image.url ? "" : ", uploading"}`}
                className={`size-full object-cover ${image.url ? "" : "opacity-50"}`}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className="bg-card absolute -top-2 -right-2"
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => reply.removeImage(image.key)}
              >
                <HiOutlineX aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {fileError ? (
        <p role="alert" className="text-destructive text-xs">
          {fileError}
        </p>
      ) : reply.imageFailed ? (
        <p role="alert" className="text-destructive text-xs">
          A photo did not upload. Remove it and add it again.
        </p>
      ) : null}
      {reply.send.isError ? (
        <p role="alert" className="text-destructive text-xs">
          Could not send: {errorMessage(reply.send.error)} The reply is kept; send it again.
        </p>
      ) : null}
      <label htmlFor="helpdesk-reply-body" className="sr-only">
        Reply
      </label>
      <Textarea
        id="helpdesk-reply-body"
        value={reply.body}
        maxLength={MESSAGE_BODY_MAX}
        placeholder="Write a reply"
        rows={3}
        className="min-h-20"
        onChange={(event) => reply.setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            reply.submit();
          }
        }}
      />
      <div className="flex items-center gap-2">
        {isStorageConfigured ? <ReplyPhotoButton reply={reply} onFileError={setFileError} /> : null}
        <span className="font-data text-muted-foreground text-xs">
          {reply.body.length} / {MESSAGE_BODY_MAX}
        </span>
        <Button
          type="submit"
          className="ml-auto"
          disabled={!reply.canSend}
          aria-busy={reply.send.isPending || undefined}
        >
          {reply.send.isPending ? "Sending…" : reply.uploading ? "Uploading…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}

/** Mounted only when a storage origin is configured: the upload hook needs one. */
function ReplyPhotoButton({
  reply,
  onFileError,
}: {
  reply: HelpdeskReply;
  onFileError: (message: string | null) => void;
}) {
  const upload = useImageUpload();
  const input = useRef<HTMLInputElement>(null);

  async function add(file: File) {
    const check = checkImageFile(file);
    if (!check.ok) {
      onFileError(
        check.reason === "too-large"
          ? "That photo is too large. Use one under 8 MB."
          : "Use a JPEG, PNG or WebP photo.",
      );
      return;
    }
    onFileError(null);
    const key = reply.startImage(URL.createObjectURL(file));
    try {
      const stored = await upload.mutateAsync({ file, purpose: "message.image", uploadId: key });
      reply.finishImage(key, stored.url);
    } catch {
      reply.finishImage(key, null);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label="Photo file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void add(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={!reply.hasRoomForImage}
        onClick={() => input.current?.click()}
      >
        <HiOutlinePhotograph aria-hidden="true" />
        Add photo
        <span className="font-data text-muted-foreground text-xs">
          {reply.images.length}/{MESSAGE_IMAGE_MAX}
        </span>
      </Button>
    </>
  );
}
