import type { ReactNode } from "react";
import { RiCheckLine } from "react-icons/ri";

import { Spinner } from "#/components/ui/spinner";
import { cn } from "#/lib/utils";

export type DeskStepState = "complete" | "current" | "upcoming" | "loading";

/**
 * Vertical step list. Completed steps are links the caller passes as
 * `action`; later steps are text. Square, and only rendered at desktop width.
 */
export function DeskStepper({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {children}
    </ol>
  );
}

export function DeskStep({
  index,
  label,
  state,
  wrap,
}: {
  index: number;
  label: ReactNode;
  state: DeskStepState;
  /** Wraps a completed or current step in the caller's link. */
  wrap?: (body: ReactNode) => ReactNode;
}) {
  const marker = (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full bg-card font-mono text-2xs font-semibold",
        state === "current" && "text-foreground shadow-[inset_0_0_0_2px_var(--color-primary)]",
        state === "complete" && "bg-primary text-primary-foreground [&_svg]:size-3",
        state === "upcoming" &&
          "text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-foreground)_18%,transparent)]",
        state === "loading" &&
          "text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-foreground)_18%,transparent)]",
      )}
    >
      {state === "complete" ? (
        <RiCheckLine aria-hidden="true" />
      ) : state === "loading" ? (
        <Spinner />
      ) : (
        index
      )}
    </span>
  );
  const body = (
    <span className="flex items-center gap-3">
      {marker}
      <span
        className={cn(
          "text-sm leading-6 font-semibold",
          state === "upcoming" && "font-medium text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
  const row = state === "complete" || state === "current" ? (wrap?.(body) ?? body) : body;
  return (
    <li
      className="group relative pb-8 last:pb-0"
      aria-current={state === "current" ? "step" : undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute start-[11px] top-7 bottom-1 w-0.5 group-last:hidden",
          state === "complete" ? "bg-primary" : "bg-foreground/15",
        )}
      />
      {row}
    </li>
  );
}
