import type { MarketplaceScope } from "@clc/core/features/marketplace/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiCloseLine, RiMap2Line, RiSearchLine } from "react-icons/ri";

import { AppMenu } from "#/components/app-menu";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  mapSearchFrom,
  marketplaceSearchForScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { onboardingSearch } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";

/** Where the bar stands: the map, or one of the lists its badges open. */
export type MarketSurface = "map" | MarketplaceScope;

/**
 * The market's top bar, the same over the map and above every list: the app
 * menu on its own square, the search field with the filter button joined to
 * its end, and Sign in beside them for a guest. The badges below open the
 * lists; in a list, a Map button floats above the navigation.
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
  current: MarketSurface;
  filter: CatalogFilterControls;
  searchLabel: string;
  /** The filter sheet, whose trigger joins the end of the search field. */
  filters: ReactNode;
  /** The Credit badge, for a signed-in member. */
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
      <MarketBadges current={current} credit={auth.isAuthenticated ? credit : undefined} />
      {current === "map" ? null : <MarketMapButton />}
    </div>
  );
}

/** The hue each list's badge takes while its list is open. */
const BADGE_HUES: Record<MarketplaceScope, string> = {
  pools: "[--hue:var(--color-info)] [--ink:var(--color-info-ink)]",
  vouchers: "[--hue:var(--color-voucher)] [--ink:var(--color-voucher-ink)]",
  offers: "[--hue:var(--color-offer)] [--ink:var(--color-offer-ink)]",
  catalogs: "[--hue:var(--color-catalog)] [--ink:var(--color-catalog-ink)]",
};

function MarketBadges({ current, credit }: { current: MarketSurface; credit?: ReactNode }) {
  const { t } = useLingui();
  const labels: Record<MarketplaceScope, string> = {
    pools: t`Pools`,
    vouchers: t`Vouchers`,
    offers: t`Offers`,
    catalogs: t`Catalogs`,
  };
  return (
    <nav
      aria-label={t`Marketplace sections`}
      className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {credit ? (
        <>
          {credit}
          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-muted-foreground/40" />
        </>
      ) : null}
      {(Object.keys(labels) as MarketplaceScope[]).map((scope) => {
        const active = scope === current;
        return (
          <Button
            key={scope}
            asChild
            variant="outline"
            tap
            className={cn(
              "font-semibold text-muted-foreground",
              BADGE_HUES[scope],
              active &&
                "border-(--hue)! bg-[color-mix(in_oklab,var(--hue)_14%,var(--color-card))] text-(--ink) shadow-[inset_0_0_0_1px_var(--hue)] hover:bg-[color-mix(in_oklab,var(--hue)_14%,var(--color-card))] hover:text-(--ink)",
            )}
          >
            {/* The open list's badge leads back to the map. */}
            {active ? (
              <Link to="/" search={(previous) => mapSearchFrom(previous)} aria-current="page">
                {labels[scope]}
              </Link>
            ) : (
              <Link
                to="/market"
                search={(previous) =>
                  marketplaceSearchForScope(pickMarketplaceSearch(previous), scope)
                }
              >
                {labels[scope]}
              </Link>
            )}
          </Button>
        );
      })}
    </nav>
  );
}

function MarketMapButton() {
  const { t } = useLingui();
  return (
    <Link
      to="/"
      search={(previous) => mapSearchFrom(previous)}
      aria-label={t`Map`}
      title={t`Map`}
      className="fixed end-4 bottom-[calc(max(var(--bottom-nav-offset),env(safe-area-inset-bottom))+1rem)] z-20 flex size-14 items-center justify-center bg-primary text-primary-foreground outline-none transition-colors hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
    >
      <RiMap2Line className="size-6" aria-hidden="true" />
    </Link>
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
