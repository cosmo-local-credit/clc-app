import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { RiCloseLine, RiSearch2Line } from "react-icons/ri";

import {
  MarketplaceResourceNavigation,
  type MarketplaceResource,
} from "#/components/marketplace-resource-navigation";
import { Button } from "#/components/ui/button";
import { BackChevron } from "#/components/wallet";
import { useMarketplaceSearchShell } from "#/features/home/stores/marketplace-search-shell";
import { cn } from "#/lib/utils";

export function MarketplaceSearchShell({
  current,
  search,
  credit,
  filters,
  showBack = true,
  className,
}: {
  current: MarketplaceResource;
  search: ReactNode;
  credit?: ReactNode;
  filters?: ReactNode;
  showBack?: boolean;
  className?: string;
}) {
  const { t } = useLingui();
  const collapsed = useMarketplaceSearchShell((state) => state.collapsed);
  const collapse = useMarketplaceSearchShell((state) => state.collapse);
  const expand = useMarketplaceSearchShell((state) => state.expand);

  if (collapsed) {
    return (
      <div className={cn("flex", className)}>
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
    <div className={cn("space-y-2 border-b border-border bg-background pb-3", className)}>
      {showBack ? <BackChevron label={t`Back`} to="/" search={{}} /> : null}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">{search}</div>
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
      <MarketplaceResourceNavigation current={current} credit={credit} filters={filters} />
    </div>
  );
}
