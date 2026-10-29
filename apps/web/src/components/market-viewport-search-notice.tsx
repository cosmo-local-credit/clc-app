import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { useNearbyCatalog } from "#/components/nearby-catalog";
import { mapSearchFrom } from "#/lib/navigation/marketplace-search";
import { cn } from "#/lib/utils";

/** Whether an active text search is limited to the area the map last showed. */
export function useViewportScopedSearch(query: string): boolean {
  const discovery = useNearbyCatalog();
  return query.trim().length > 0 && Boolean(discovery?.bounds?.length);
}

/** Explains why an active text search can differ after the map has moved. */
export function MarketViewportSearchNotice({
  query,
  className,
}: {
  query: string;
  className?: string;
}) {
  if (!useViewportScopedSearch(query)) return null;

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <Trans>
        Search results use the area shown on the{" "}
        <Link
          className="font-medium text-foreground underline underline-offset-4"
          to="/"
          search={(previous) => mapSearchFrom(previous)}
        >
          map
        </Link>
        .
      </Trans>
    </p>
  );
}
