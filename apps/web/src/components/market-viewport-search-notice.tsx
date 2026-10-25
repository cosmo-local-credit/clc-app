import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { useNearbyCatalog } from "#/components/nearby-catalog";
import { mapSearchFrom } from "#/lib/navigation/marketplace-search";
import { cn } from "#/lib/utils";

/** Explains why an active text search can differ after the map has moved. */
export function MarketViewportSearchNotice({
  query,
  className,
}: {
  query: string;
  className?: string;
}) {
  const discovery = useNearbyCatalog();
  if (query.trim().length === 0 || !discovery?.bounds?.length) return null;

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
