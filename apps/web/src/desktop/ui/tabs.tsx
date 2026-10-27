import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { cn } from "#/lib/utils";

/** Underlined tabs. Each tab is the caller's link, so the URL owns the selection. */
export function DeskTabs({
  children,
  label,
  tight = false,
  className,
}: {
  children: ReactNode;
  label: string;
  /** The narrow results column and the place panel. */
  tight?: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      data-tight={tight ? "" : undefined}
      className={cn(
        "group/tabs flex min-w-0 items-end overflow-x-auto border-border border-b [scrollbar-width:none]",
        className,
      )}
    >
      {children}
    </nav>
  );
}

/** Pass a `<Link>` (or a `<button>`) as the only child; it gets the tab look. */
export function DeskTab({ active, children }: { active: boolean; children: ReactElement }) {
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  return cloneElement(child, {
    "aria-current": active ? "page" : undefined,
    className: cn(
      "-mb-px shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap group-data-tight/tabs:px-2.5",
      active
        ? "border-foreground font-semibold text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
      child.props.className as string | undefined,
    ),
  });
}
