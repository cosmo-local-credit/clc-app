import { MESSAGE_BODY_MAX } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRef } from "react";
import { RiCloseLine, RiImageAddLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { useOperatorHelpdeskReply } from "#/features/messaging/hooks/use-operator-helpdesk";
import { cn } from "#/lib/utils";

/** Admin/Superadmin reply composer shared by the phone and desktop Helpdesk views. */
export function OperatorHelpdeskComposer({
  conversationId,
  desktop = false,
}: {
  conversationId: number;
  desktop?: boolean;
}) {
  const { t } = useLingui();
  const composer = useOperatorHelpdeskReply(conversationId);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        composer.submit();
      }}
    >
      {composer.images.length > 0 ? (
        <ul className="flex gap-2" aria-label={t`Photos to send`}>
          {composer.images.map((image) => (
            <li key={image.key} className="relative size-16 border border-border bg-card">
              <img
                src={image.previewUrl}
                alt=""
                className={cn("size-full object-cover", !image.url && "opacity-50")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="absolute -top-2 -end-2"
                aria-label={t`Remove photo`}
                onClick={() => composer.removeImage(image.key)}
              >
                <RiCloseLine aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {composer.imageError ? (
        <p role="alert" className="text-destructive text-xs">
          {composer.imageError === "unsupported" ? (
            <Trans>Use a JPEG, PNG or WebP photo under 8 MB.</Trans>
          ) : (
            <Trans>The photo didn't upload. Remove it and try again.</Trans>
          )}
        </p>
      ) : null}
      {composer.send.isError ? (
        <p role="alert" className="text-destructive text-xs">
          <Trans>Couldn't send. Your message is kept; send it again.</Trans>
        </p>
      ) : null}
      <div className={cn("flex gap-2", desktop ? "items-end" : "items-stretch")}>
        {composer.canAddImage ? (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void composer.addImage(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              tap={!desktop}
              aria-label={t`Add a photo`}
              onClick={() => fileInput.current?.click()}
            >
              <RiImageAddLine aria-hidden="true" />
            </Button>
          </>
        ) : null}
        <label htmlFor={`helpdesk-reply-${conversationId}`} className="sr-only">
          <Trans>Reply</Trans>
        </label>
        <Textarea
          id={`helpdesk-reply-${conversationId}`}
          value={composer.body}
          maxLength={MESSAGE_BODY_MAX}
          placeholder={t`Write a reply`}
          rows={desktop ? 1 : 2}
          className={cn("flex-1", desktop && "field-sizing-content max-h-40 min-h-9 resize-none")}
          onChange={(event) => composer.setBody(event.target.value)}
          onKeyDown={(event) => {
            if (
              !desktop ||
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return;
            event.preventDefault();
            composer.submit();
          }}
        />
        <Button
          type="submit"
          tap={!desktop}
          className={desktop ? undefined : "flex-1"}
          disabled={!composer.canSend && !composer.send.isPending}
          pending={composer.send.isPending || composer.uploading}
        >
          {composer.send.isPending ? <Trans>Sending…</Trans> : <Trans>Send reply</Trans>}
        </Button>
      </div>
    </form>
  );
}
