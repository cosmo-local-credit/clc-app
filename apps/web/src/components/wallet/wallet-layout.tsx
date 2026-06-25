import type { ReactNode } from "react";
import { RiArrowLeftLine } from "react-icons/ri";

import { Link } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

export function BackChevron({
  label,
  to,
  onClick,
  className,
}: {
  label: string;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
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
  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

export function SectionHeader({
  title,
  action,
  actionTo,
  onAction,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  actionTo?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-3", className)}>
      <h2 className="font-heading font-semibold text-base">{title}</h2>
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
