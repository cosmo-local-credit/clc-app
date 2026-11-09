import type { Message } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, type Ref, useEffect, useLayoutEffect, useRef } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

/**
 * The thread pane's scrolling body: anything the thread shows above its
 * messages (a request, a notice), then the messages oldest first.
 *
 * It scrolls on its own, inside the pane. Opening a thread, and each message
 * the caller sends or that arrives while they are at the bottom, keeps the
 * newest one in view; loading earlier messages keeps the reader's place. It
 * reports whether the newest message is on screen, which is when the read
 * marker may move.
 */
export function MessageScrollerDesk({
  before,
  after,
  messages,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onNewestVisibleChange,
}: {
  before?: ReactNode;
  after?: ReactNode;
  messages: readonly Message[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onNewestVisibleChange: (visible: boolean) => void;
}) {
  const { t } = useLingui();
  const scroller = useRef<HTMLDivElement>(null);
  const newestRef = useRef<HTMLLIElement | null>(null);
  const newestId = messages.at(-1)?.id;
  const newestSender = messages.at(-1)?.sender;
  const oldestId = messages[0]?.id;
  const scrolledFor = useRef<number | undefined>(undefined);
  // Distance from the bottom when Load earlier was pressed, restored once the
  // older page is in so the message being read stays where it was.
  const anchor = useRef<number | null>(null);
  const visibleChange = useRef(onNewestVisibleChange);
  visibleChange.current = onNewestVisibleChange;

  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box || anchor.current === null) return;
    box.scrollTop = box.scrollHeight - anchor.current;
    anchor.current = null;
  }, [oldestId]);

  useEffect(() => {
    const box = scroller.current;
    if (!box || newestId === undefined || newestId === scrolledFor.current) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    if (scrolledFor.current === undefined || nearBottom || newestSender === "self") {
      box.scrollTop = box.scrollHeight;
    }
    scrolledFor.current = newestId;
  }, [newestId, newestSender]);

  useEffect(() => {
    const target = newestRef.current;
    if (!target) {
      visibleChange.current(false);
      return;
    }
    // Without an observer the pane has just scrolled to its newest message.
    if (typeof IntersectionObserver === "undefined") {
      visibleChange.current(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => visibleChange.current(entries.some((entry) => entry.isIntersecting)),
      { root: scroller.current },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [newestId]);

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid content-start gap-4 p-4">
        {before}
        {hasOlder ? (
          <Button
            variant="outline"
            className="justify-self-center"
            pending={loadingOlder}
            onClick={() => {
              const box = scroller.current;
              if (box) anchor.current = box.scrollHeight - box.scrollTop;
              onLoadOlder();
            }}
          >
            <Trans>Load earlier messages</Trans>
          </Button>
        ) : null}
        {messages.length > 0 ? (
          <ol className="grid gap-2" aria-label={t`Messages`}>
            {messages.map((message, index) => (
              <MessageBubbleDesk
                key={message.id}
                message={message}
                ref={index === messages.length - 1 ? newestRef : undefined}
              />
            ))}
          </ol>
        ) : null}
        {after}
      </div>
    </div>
  );
}

function MessageBubbleDesk({ message, ref }: { message: Message; ref?: Ref<HTMLLIElement> }) {
  const { i18n } = useLingui();
  const own = message.sender === "self";
  return (
    <li ref={ref} className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}>
      {message.sender === "support" ? (
        <span className="text-xs font-semibold text-muted-foreground">
          <Trans>Support</Trans>
        </span>
      ) : null}
      <div
        className={cn(
          "grid max-w-[min(70%,36rem)] gap-2 border p-3 text-sm",
          own
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-foreground",
        )}
      >
        {message.imageUrls.length > 0 ? (
          <div className={cn("grid gap-1", message.imageUrls.length > 1 && "grid-cols-2")}>
            {message.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer noopener">
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full max-w-60 object-cover"
                />
              </a>
            ))}
          </div>
        ) : null}
        {message.body ? (
          <p dir="auto" className="whitespace-pre-wrap break-words">
            {message.body}
          </p>
        ) : null}
      </div>
      <time dateTime={message.createdAt} className="font-mono text-2xs text-muted-foreground">
        {i18n.date(new Date(message.createdAt), { dateStyle: "short", timeStyle: "short" })}
      </time>
    </li>
  );
}
