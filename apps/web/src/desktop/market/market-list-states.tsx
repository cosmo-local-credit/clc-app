import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import type { MarketListScope } from "#/lib/navigation/marketplace-search";

/** The Offers tiles flow into as many columns as fit 14rem, so an open card or a narrow canvas loses a column, not the tile. */
export const OFFER_GRID = "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4";

const SKELETON_ROWS = 8;
const SKELETON_NAME_WIDTHS = ["w-2/5", "w-1/3", "w-1/2", "w-2/5"] as const;

/**
 * The first page on its way, shaped like what replaces it and flat: table rows
 * for the lists, image tiles for Offers. The label is announced; the shapes are
 * not. Nothing here claims there is data, and a spinner is left to refreshes.
 */
export function MarketListSkeleton({ scope, label }: { scope: MarketListScope; label: ReactNode }) {
  const items = Array.from({ length: SKELETON_ROWS }, (_, index) => index);
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {scope === "offers" ? (
        <div aria-hidden="true" className={OFFER_GRID}>
          {items.slice(0, 4).map((index) => (
            <div key={index} className="border border-border bg-card">
              <Skeleton className="aspect-[4/3] w-full" />
              <div className="grid gap-2 p-3">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="border border-border bg-card">
          {items.map((index) => (
            <div
              key={index}
              className="flex min-h-12 items-center gap-2.5 border-border border-t px-3.5 py-2.5 first:border-t-0"
            >
              <Skeleton className="size-7 shrink-0" />
              <Skeleton
                className={`h-3.5 ${SKELETON_NAME_WIDTHS[index % SKELETON_NAME_WIDTHS.length]}`}
              />
              <Skeleton className="ms-auto h-3 w-1/6" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What sits under the last row, one of four things. The next page loading; the
 * next page failing, with the rows kept and Retry beside the message; more
 * pages still to come, with a visible Load more for when scrolling has not
 * reached them; or, once nothing is left to load, that the list has ended, so
 * a failed fetch is never mistaken for the end.
 */
export function MarketListFooter({
  next,
  ended,
}: {
  next: { hasMore: boolean; loading: boolean; failed: boolean; load: () => void };
  /** Nothing is refreshing or retained, so the end of the loaded rows is the end of the list. */
  ended: boolean;
}) {
  if (next.loading) {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"
      >
        <Spinner />
        <Trans>Loading more…</Trans>
      </p>
    );
  }
  if (next.failed) {
    return (
      <div role="alert" className="flex items-center justify-center gap-3 py-3">
        <span className="text-sm">
          <Trans>Couldn't load more</Trans>
        </span>
        <Button variant="outline" onClick={next.load}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }
  if (next.hasMore) {
    return (
      <div className="flex justify-center py-3">
        <Button variant="outline" onClick={next.load}>
          <Trans>Load more</Trans>
        </Button>
      </div>
    );
  }
  if (!ended) return null;
  return (
    <p className="py-3 text-center text-xs text-muted-foreground">
      <Trans>No more results</Trans>
    </p>
  );
}
