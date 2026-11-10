import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

/**
 * Activity's Messages and Helpdesk: the title and section tabs, then one flat
 * panel that fills the rest of the canvas. Its panes scroll on their own, so
 * the composer stays at the bottom of the thread while the list scrolls.
 */
export function DeskInboxFrame({
  header,
  children,
  className,
}: {
  header: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 pt-7 @4xl:px-8">{header}</div>
      <div
        className={cn(
          "mx-6 mt-4 mb-6 flex min-h-96 flex-1 border border-border bg-card @4xl:mx-8",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
