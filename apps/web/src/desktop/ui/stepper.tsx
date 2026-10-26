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
        "flex size-6 shrink-0 items-center justify-center border font-mono text-2xs",
        state === "current" && "border-primary bg-primary text-primary-foreground",
        state === "complete" && "border-primary text-primary",
        state === "upcoming" && "border-border text-muted-foreground",
        state === "loading" && "border-border text-foreground",
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
          "font-heading text-sm font-semibold",
          state === "upcoming" && "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
  const row = state === "complete" || state === "current" ? (wrap?.(body) ?? body) : body;
  return (
    <li
      className="group relative pb-6 last:pb-0"
      aria-current={state === "current" ? "step" : undefined}
    >
      <span
        aria-hidden="true"
        className="absolute start-3 top-6 bottom-0 w-px bg-border group-last:hidden"
      />
      {row}
    </li>
  );
}
