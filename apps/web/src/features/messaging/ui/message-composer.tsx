import { MESSAGE_BODY_MAX } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRef } from "react";
import { RiCloseLine, RiImageAddLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { useMessageComposer } from "../hooks/use-message-composer";

/**
 * The thread's composer: the Send screen's message field plus photos through
 * the image upload client. A failed send keeps the draft, and sending it again
 * reuses its `clientId`.
 */
export function MessageComposer({ conversationId }: { conversationId: number }) {
  const { t } = useLingui();
  const composer = useMessageComposer(conversationId);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <form
      className="space-y-2"
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
                className={`size-full object-cover ${image.url ? "" : "opacity-50"}`}
              />
              <Button
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
      <label htmlFor="message-composer-body" className="sr-only">
        {t`Message`}
      </label>
      <Textarea
        id="message-composer-body"
        value={composer.body}
        maxLength={MESSAGE_BODY_MAX}
        placeholder={t`Write a message`}
        className="min-h-11"
        rows={2}
        onChange={(event) => composer.setBody(event.target.value)}
      />
      <div className="flex gap-2">
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
              variant="outline"
              size="icon"
              tap
              aria-label={t`Add a photo`}
              onClick={() => fileInput.current?.click()}
            >
              <RiImageAddLine aria-hidden="true" />
            </Button>
          </>
        ) : null}
        <Button
          type="submit"
          tap
          className="flex-1"
          disabled={!composer.canSend && !composer.send.isPending}
          pending={composer.send.isPending || composer.uploading}
        >
          {composer.send.isPending ? <Trans>Sending…</Trans> : <Trans>Send</Trans>}
        </Button>
      </div>
    </form>
  );
}
