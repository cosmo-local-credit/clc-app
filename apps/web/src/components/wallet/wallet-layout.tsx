import type { MouseEvent, ReactNode } from "react";
import { RiArrowLeftLine } from "react-icons/ri";

import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

export function BackChevron({
  label,
  to,
  search,
  onClick,
  className,
}: {
  label: string;
  /** Fallback destination used only when there is no history to go back to. */
  to?: string;
  /**
   * Fallback search params for `to` when there is no history (e.g. deep link).
   * Ignored when `canGoBack` is true — history.back() is used instead.
   */
  search?: Record<string, unknown>;
  onClick?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const classes = cn(
    "-ms-1.5 flex h-11 items-center gap-1.5 px-1.5 font-medium text-muted-foreground text-sm",
    className,
  );
  const content = (
    <>
      <RiArrowLeftLine className="rtl:-scale-x-100 size-3.5" aria-hidden="true" />
      {label}
    </>
  );
  // An explicit onClick always wins.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  // Keep the anchor stable across SSR and hydration: the server cannot know
  // whether client history can go back. An ordinary click uses real history;
  // modified clicks retain normal link behavior to the deep-link fallback.
  return (
    <Link
      to={to ?? "/"}
      search={search}
      className={classes}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (
          !canGoBack ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        router.history.back();
      }}
    >
      {content}
    </Link>
  );
}

export function SectionHeader({
  id,
  title,
  action,
  actionTo,
  onAction,
  className,
}: {
  id?: string;
  title: ReactNode;
  action?: ReactNode;
  actionTo?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-3", className)}>
      <h2 id={id} className="font-heading font-semibold text-base">
        {title}
      </h2>
      {action ? (
        actionTo ? (
          <Link
            to={actionTo}
            className="font-medium text-foreground text-sm underline-offset-4 hover:underline"
          >
            {action}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="font-medium text-foreground text-sm underline-offset-4 hover:underline"
          >
            {action}
          </button>
        )
      ) : null}
    </div>
  );
}
