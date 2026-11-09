import { Trans } from "@lingui/react/macro";

import { Skeleton } from "#/components/ui/skeleton";

/**
 * What the canvas shows while a lazy desktop view loads: a page's own shape (a
 * title, a line under it and a panel) in flat placeholder bars. It draws no
 * rows, figures or tiles, so it never suggests data that has not arrived. The
 * shell around it (sidebar, top bar) is already on screen.
 */
export function DeskLoading() {
  return (
    <div
      aria-busy="true"
      className="grid min-h-full w-full max-w-[1264px] min-w-0 content-start gap-6 bg-background px-6 pt-7 pb-10 @4xl:px-8"
    >
      <div role="status" className="grid gap-2">
        <span className="sr-only">
          <Trans>Loading…</Trans>
        </span>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>
      <div aria-hidden="true" className="grid gap-3 border border-border bg-card p-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
