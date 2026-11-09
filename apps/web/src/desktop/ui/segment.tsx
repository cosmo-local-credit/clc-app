import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { cn } from "#/lib/utils";

/** The joined two- or three-way switch: Map | List. */
export function DeskSegment({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex shrink-0 border border-foreground/25 bg-card", className)}
    >
      {children}
    </div>
  );
}

export function DeskSegmentItem({ active, children }: { active: boolean; children: ReactElement }) {
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  return cloneElement(child, {
    "aria-current": active ? "page" : undefined,
    "aria-pressed": child.type === "button" ? active : undefined,
    className: cn(
      "flex h-7 items-center px-2.5 text-xs font-medium",
      active ? "bg-foreground text-background" : "text-foreground hover:bg-muted",
      child.props.className as string | undefined,
    ),
  });
}

/**
 * A 30px filter chip: Filters, Credit, All / Vouchers / Stables. The child is
 * the caller's button or link; `on` fills it.
 */
export function DeskChip({ on = false, children }: { on?: boolean; children: ReactElement }) {
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  return cloneElement(child, {
    className: cn(
      "inline-flex h-[30px] shrink-0 items-center gap-1.5 border px-2.5 text-xs font-medium whitespace-nowrap [&_svg]:size-4",
      on
        ? "border-foreground bg-foreground text-background"
        : "border-foreground/25 bg-card text-foreground hover:bg-muted",
      child.props.className as string | undefined,
    ),
  });
}
