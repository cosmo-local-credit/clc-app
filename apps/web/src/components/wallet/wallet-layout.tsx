import type { ReactNode } from "react";
import { RiArrowLeftLine } from "react-icons/ri";

import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

export function BackChevron({
  label,
  to,
  onClick,
  className,
}: {
  label: string;
  /** Fallback destination used only when there is no history to go back to. */
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const classes = cn(
    "-ml-1.5 flex h-11 items-center gap-1.5 px-1.5 font-medium text-muted-foreground text-sm",
    className,
  );
  const content = (
    <>
      <RiArrowLeftLine className="size-3.5" aria-hidden="true" />
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
  // Prefer real history navigation so back returns to the actual previous
  // screen. Fall back to `to` (or the index) only on a fresh/deep-linked load
  // where there is no in-app history to pop.
  if (canGoBack) {
    return (
      <button type="button" onClick={() => router.history.back()} className={classes}>
        {content}
      </button>
    );
  }
  return (
    <Link to={to ?? "/"} className={classes}>
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
