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
      <div className="flex h-[30px] items-center justify-between gap-3">
        <SectionHeading as="h2" variant="group">
          {title}
        </SectionHeading>
        {action}
      </div>
      {children}
    </section>
  );
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
        "min-w-0 px-8 pt-7 pb-12",
        width === "read" && "mx-auto w-full max-w-[1200px]",
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
