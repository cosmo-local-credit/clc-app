import type { ReactNode } from "react";

import { SectionHeading } from "#/components/ui/section-heading";
import { cn } from "#/lib/utils";

/** Page title. The same 1.75rem lock as the phone. */
export function DeskTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-heading text-[1.75rem] font-bold leading-tight">{children}</h1>;
}

/**
 * A section whose header is a fixed 30px row, so tiles in one row line up
 * even when one of them has an action and the next does not.
 */
export function DeskSection({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col", className)}>
      <div className="mb-2.5 flex h-[30px] items-center justify-between gap-3">
        <SectionHeading as="h2" variant="section">
          {title}
        </SectionHeading>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The title row: the page title, then any actions pushed to the end. */
export function DeskTitleRow({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  /** One line under the title: an address, a place, a count. */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <DeskTitle>{title}</DeskTitle>
        {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The link that sits at the end of a section header: View all, Create. */
export function deskSectionLinkClass(className?: string) {
  return cn("text-xs font-semibold text-primary hover:underline", className);
}

/** Reading pages stop at 1200px. Tables and the market pass `full`. */
export function DeskCanvas({
  children,
  width = "read",
  className,
}: {
  children: ReactNode;
  width?: "read" | "full";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 content-start gap-6 px-8 pt-7 pb-10",
        width === "read" && "w-full max-w-[1264px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DeskPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border border-border bg-card p-4", className)}>{children}</div>;
}

/**
 * A detail page: the main column, and a 360px column for the panel that
 * sits beside it (swap, publish, a summary). The side column sticks.
 */
export function DeskDetail({
  main,
  side,
  className,
}: {
  main: ReactNode;
  side: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_360px] items-start gap-6 px-8 pt-7 pb-10",
        "w-full max-w-[1324px]",
        className,
      )}
    >
      <div className="grid min-w-0 content-start gap-6">{main}</div>
      <div className="sticky top-7 grid min-w-0 content-start gap-4">{side}</div>
    </div>
  );
}

/** A row list inside a white tile: one border, rows split by rules. */
export function DeskRowList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col border border-border bg-card [&>*+*]:border-border [&>*+*]:border-t",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One row of a `DeskRowList`: lead, a title over a subtitle, and a trailing slot. */
export function DeskRow({
  lead,
  title,
  subtitle,
  trail,
  selected = false,
  className,
}: {
  lead?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trail?: ReactNode;
  selected?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-14 min-w-0 items-center gap-3 px-3.5 py-2.5",
        selected && "bg-primary/[0.07] shadow-[inset_2px_0_0_var(--color-primary)]",
        className,
      )}
    >
      {lead}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      {trail}
    </div>
  );
}

/** The mono caps label over a figure: TOTAL VALUE, RECEIVED. */
export function DeskEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono text-2xs tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}
