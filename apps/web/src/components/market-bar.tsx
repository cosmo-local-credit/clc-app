import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiCloseLine, RiSearchLine } from "react-icons/ri";

import { AppMenu } from "#/components/app-menu";
import {
  MarketplaceResourceNavigation,
  type MarketplaceResource,
} from "#/components/marketplace-resource-navigation";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { onboardingSearch } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";

/**
 * The market's top bar, the same over the map and above every list: the app
 * menu on its own square, the search field with the filter button joined to
 * its end, and Sign in beside them for a guest. The section row sits below.
 */
export function MarketBar({
  current,
  filter,
  searchLabel,
  filters,
  credit,
  surface = "page",
  className,
}: {
  current: MarketplaceResource;
  filter: CatalogFilterControls;
  searchLabel: string;
  /** The filter sheet, whose trigger joins the end of the search field. */
  filters: ReactNode;
  credit?: ReactNode;
  surface?: "map" | "page";
  className?: string;
}) {
  const auth = useAuthStatus();
  const surfaceClassName =
    surface === "map" ? "bg-transparent" : "border-b border-border bg-background pb-3";

  return (
    <div className={cn("space-y-2", surfaceClassName, className)}>
      <div className="flex items-center gap-2">
        <AppMenu />
        <div className="flex h-11 min-w-0 flex-1 items-center border border-input bg-card focus-within:border-foreground">
          <MarketSearchInput filter={filter} label={searchLabel} />
          {filters}
        </div>
        {!auth.isLoading && !auth.isAuthenticated ? (
          <Button asChild size="lg">
            <Link to="/onboarding" search={onboardingSearch("welcome")}>
              <Trans>Sign in</Trans>
            </Link>
          </Button>
        ) : null}
      </div>
      <MarketplaceResourceNavigation current={current} credit={credit} />
    </div>
  );
}

function MarketSearchInput({ filter, label }: { filter: CatalogFilterControls; label: string }) {
  const { t } = useLingui();
  return (
    <div className="relative flex h-full min-w-0 flex-1 items-center">
      <RiSearchLine
        className="pointer-events-none absolute start-3 size-4 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        dir="auto"
        type="search"
        value={filter.term}
        onChange={(event) => filter.setTerm(event.target.value)}
        aria-label={label}
        placeholder={label}
        className="h-full min-w-0 flex-1 appearance-none bg-transparent ps-9 pe-2 text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {filter.term !== "" ? (
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={filter.clearTerm}
          aria-label={t`Clear search`}
          className="text-muted-foreground"
        >
          <RiCloseLine className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
