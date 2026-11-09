import type { Message } from "@clc/core/features/messaging/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { type Ref, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

/**
 * A thread's messages, oldest first. Reports whether the newest one is on
 * screen, which is when the read marker may move.
 */
export function MessageList({
  messages,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onNewestVisibleChange,
}: {
  messages: readonly Message[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onNewestVisibleChange: (visible: boolean) => void;
}) {
  const newestRef = useRef<HTMLLIElement | null>(null);
  const newestId = messages.at(-1)?.id;
  const newestSender = messages.at(-1)?.sender;
  const [scrolledFor, setScrolledFor] = useState<number | undefined>(undefined);
  const visibleChange = useRef(onNewestVisibleChange);
  visibleChange.current = onNewestVisibleChange;

  // Opening a thread, and each message the caller sends or that arrives while
  // they are already at the bottom, keeps the newest message in view.
  useEffect(() => {
    if (newestId === undefined || newestId === scrolledFor) return;
    const target = newestRef.current;
    const nearBottom =
      typeof window === "undefined" ||
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    if (scrolledFor === undefined || nearBottom || newestSender === "self") {
      target?.scrollIntoView?.({ block: "end" });
    }
    setScrolledFor(newestId);
  }, [newestId, newestSender, scrolledFor]);

  useEffect(() => {
    const target = newestRef.current;
    if (!target) {
      visibleChange.current(false);
      return;
    }
    // Without an observer the thread has just scrolled to its newest message.
    if (typeof IntersectionObserver === "undefined") {
      visibleChange.current(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      visibleChange.current(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [newestId]);

  return (
    <div className="space-y-3">
      {hasOlder ? (
        <Button
          variant="outline"
          tap
          className="w-full"
          pending={loadingOlder}
          onClick={onLoadOlder}
        >
          <Trans>Load earlier messages</Trans>
        </Button>
      ) : null}
      <ol className="space-y-2">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            ref={index === messages.length - 1 ? newestRef : undefined}
          />
        ))}
      </ol>
    </div>
  );
}

function MessageBubble({ message, ref }: { message: Message; ref?: Ref<HTMLLIElement> }) {
  const { i18n } = useLingui();
  const own = message.sender === "self";
  return (
    <li ref={ref} className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}>
      {message.sender === "support" ? (
        <span className="font-semibold text-muted-foreground text-xs">
          <Trans>Support</Trans>
        </span>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] space-y-2 border p-3 text-sm",
          own
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-foreground",
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
                  className="aspect-square w-full object-cover"
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
