import type { ReactNode } from "react";
import { cn } from "#/lib/utils";

/**
 * The console's section typography, in one place.
 *
 * CLAUDE.md fixes these classes as an admin convention, and the literal string was
 * repeated across eight files with two local `SectionLabel` copies drifting out of
 * it. Changing the convention should mean editing this file, not grepping for
 * `tracking-[0.14em]`.
 *
 * Two components because they play different roles:
 *
 * - `SectionHeading` is an `h2` and belongs to the document outline. Screen-reader
 *   users navigate a detail screen by its headings, so a section that titles real
 *   content uses this.
 * - `SectionLabel` is a `p` and titles a control group inside a panel. It is not
 *   part of the outline — announcing "Limits" as a heading peer of "Balances" would
 *   misdescribe the page.
 *
 * Deliberately *not* used by `metric-card` (a `div`, labelling a figure rather than
 * a section) or by the sign-in divider (a `span` at a smaller size, inline between
 * two rules). Folding those in would change their element or their type scale.
 */
const SECTION_TYPE = "font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase";

export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  /** For the caller's spacing, e.g. `mb-3`. */
  className?: string;
}) {
  return <h2 className={cn(SECTION_TYPE, "font-medium", className)}>{children}</h2>;
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(SECTION_TYPE, className)}>{children}</p>;
}
