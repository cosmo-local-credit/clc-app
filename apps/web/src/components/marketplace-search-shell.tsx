import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiCloseLine, RiFilter3Line, RiSearch2Line } from "react-icons/ri";

import { AppMenu } from "#/components/app-menu";
import {
  MarketplaceResourceNavigation,
  type MarketplaceResource,
} from "#/components/marketplace-resource-navigation";
import { Button } from "#/components/ui/button";
import { useMarketplaceSearchShell } from "#/features/home/stores/marketplace-search-shell";
import { cn } from "#/lib/utils";

export function MarketplaceSearchShell({
  current,
  search,
  credit,
  filters,
  surface = "page",
  className,
}: {
  current: MarketplaceResource;
  search: ReactNode;
  credit?: ReactNode;
  filters?: ReactNode;
  surface?: "map" | "page";
  className?: string;
}) {
  const { t } = useLingui();
  const collapsed = useMarketplaceSearchShell((state) => state.collapsed);
  const collapse = useMarketplaceSearchShell((state) => state.collapse);
  const expand = useMarketplaceSearchShell((state) => state.expand);
  const surfaceClassName =
    surface === "map" ? "bg-transparent" : "border-b border-border bg-background pb-3";

  if (collapsed) {
    return (
      <div className={cn("flex gap-1", surfaceClassName, className)}>
        <AppMenu />
        <Button
          size="icon"
          className="size-11"
          onClick={expand}
          aria-label={t`Open marketplace search`}
        >
          <RiSearch2Line className="size-5" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", surfaceClassName, className)}>
      <div className="flex items-end gap-1">
        <AppMenu />
        <div className="min-w-0 flex-1">{search}</div>
        {filters ?? (
          <Button
            disabled
            size="icon"
            className="size-11 bg-destructive text-destructive-foreground opacity-100"
            aria-label={t`Filters`}
            title={t`Filters`}
          >
            <RiFilter3Line className="size-5" aria-hidden="true" />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="size-11 bg-card"
          onClick={collapse}
          aria-label={t`Collapse marketplace search`}
        >
          <RiCloseLine className="size-5" aria-hidden="true" />
          <span className="sr-only">
            <Trans>Collapse marketplace search</Trans>
          </span>
        </Button>
      </div>
      <MarketplaceResourceNavigation current={current} credit={credit} />
    </div>
  );
}
