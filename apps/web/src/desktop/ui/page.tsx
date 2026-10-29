import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { SectionHeading } from "#/components/ui/section-heading";
import { cn } from "#/lib/utils";

/**
 * The 2px primary edge on the start side of a selected row, flipped in RTL.
 * `DESK_SELECTED` adds the 7% tint; the sidebar supplies its own fill.
 */
export const DESK_SELECTED_EDGE =
  "shadow-[inset_2px_0_0_var(--color-primary)] rtl:shadow-[inset_-2px_0_0_var(--color-primary)]";
export const DESK_SELECTED = `bg-primary/[0.07] ${DESK_SELECTED_EDGE}`;

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
  wrap = false,
  className,
}: {
  title: ReactNode;
  /** One line under the title: an address, a place, a count. */
  meta?: ReactNode;
  actions?: ReactNode;
  /**
   * Detail pages: let a long name and its meta line wrap, so the value a
   * person opened the page to verify is never cut. Browsing rows truncate.
   */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className={cn("min-w-0", wrap && "[overflow-wrap:anywhere]")}>
          <DeskTitle>{title}</DeskTitle>
        </div>
        {meta ? (
          <div
            className={cn(
              "text-xs text-muted-foreground",
              wrap ? "[overflow-wrap:anywhere]" : "truncate",
            )}
          >
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The link that sits at the end of a section header: View all, Create. */
export function deskSectionLinkClass(className?: string) {
  return cn("text-xs font-semibold text-primary hover:underline", className);
}

/**
 * Reading pages stop at 1200px. Tables and the market pass `full`. Gutters are
 * 24px while the canvas is under 56rem wide and 32px once it is ampler. The
 * desktop shell and `DeskSplit` are the size containers these queries read.
 */
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
        "grid min-w-0 content-start gap-6 px-6 pt-7 pb-10 @4xl:px-8",
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

/** The canvas width, in rem, at which the side column docks. Keep in step with `@min-[63rem]` below. */
const DETAIL_DOCK_REM = 63;

/**
 * A detail page: the main column, and a 360px column for the panel that
 * sits beside it (swap, publish, a summary). The side column docks and sticks
 * only when the canvas is at least 63rem wide, which leaves the main column
 * 560px or more; below that the side panel stacks under (or, with
 * `stacked="side-first"`, over) the main column at full width.
 *
 * Stacked, the DOM order is the visual order, so keyboard and screen-reader
 * order match what is on screen. The columns are keyed, so a resize that
 * flips the order moves them without remounting their state.
 */
export function DeskDetail({
  main,
  side,
  stacked = "main-first",
  className,
}: {
  main: ReactNode;
  side: ReactNode;
  /** Where the side panel goes when there is no room to dock it. */
  stacked?: "main-first" | "side-first";
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(true);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      // A width of 0 means not laid out (hidden, or jsdom): keep the docked order.
      setDocked(width === 0 || width >= DETAIL_DOCK_REM * rem);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const mainColumn = (
    <div key="main" className="grid min-w-0 content-start gap-6">
      {main}
    </div>
  );
  const sideColumn = (
    <div
      key="side"
      className="grid min-w-0 content-start gap-4 @min-[63rem]:sticky @min-[63rem]:top-7"
    >
      {side}
    </div>
  );

  return (
    <div
      ref={frame}
      className={cn(
        "grid min-w-0 grid-cols-1 items-start gap-6 px-6 pt-7 pb-10 @4xl:px-8 @min-[63rem]:grid-cols-[minmax(0,1fr)_360px]",
        "w-full max-w-[1324px]",
        className,
      )}
    >
      {stacked === "side-first" && !docked ? [sideColumn, mainColumn] : [mainColumn, sideColumn]}
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
        selected && DESK_SELECTED,
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
