import type { MarketplaceScope } from "@clc/core/features/marketplace/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type { IconType } from "react-icons";
import {
  RiBookOpenLine,
  RiCoupon3Line,
  RiGroupLine,
  RiMap2Line,
  RiStore2Line,
} from "react-icons/ri";

import { AppMenu } from "#/components/app-menu";
import { MarketSearchField, MarketSearchScreen } from "#/components/market-search";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  mapSearchFrom,
  marketplaceSearchForScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import type { PersistedCatalogFilterControls } from "#/lib/navigation/use-persisted-catalog-filter";
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
  /** A remembered filter keeps the tags the search screen adds. */
  filter: CatalogFilterControls | PersistedCatalogFilterControls;
  searchLabel: string;
  /** The filter sheet, whose trigger joins the end of the search field. */
  filters: ReactNode;
  /** The Credit badge, for a signed-in member. */
  credit?: ReactNode;
  surface?: "map" | "page";
  className?: string;
}) {
  const auth = useAuthStatus();
  const [searchOpen, setSearchOpen] = useState(false);
  const surfaceClassName =
    surface === "map" ? "bg-transparent" : "border-b border-border bg-background pb-3";

  return (
    <div className={cn("space-y-2", surfaceClassName, className)}>
      <div className="flex items-center gap-2">
        <AppMenu />
        <div className="flex h-11 min-w-0 flex-1 items-center border border-input bg-card focus-within:border-foreground">
          <MarketSearchField
            filter={filter}
            label={searchLabel}
            onOpen={() => setSearchOpen(true)}
          />
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
      {searchOpen ? (
        <MarketSearchScreen
          onClose={() => setSearchOpen(false)}
          filter={filter}
          label={searchLabel}
          onApplyTags={(tags) =>
            "applyFacetFilters" in filter
              ? filter.applyFacetFilters(
                  tags,
                  filter.tagMatch,
                  filter.vouchers,
                  filter.voucherMatch,
                )
              : filter.setTags(tags, filter.tagMatch)
          }
        />
      ) : null}
      {current === "map" ? null : <MarketMapButton />}
    </div>
  );
}

/**
 * Each list's badge keeps its own hue: the icon and label always read in its
 * ink, and the open list's badge adds the outline and tint.
 */
const BADGE_HUES: Record<MarketplaceScope, string> = {
  pools: "[--hue:var(--color-info)] [--ink:var(--color-info-ink)]",
  vouchers: "[--hue:var(--color-voucher)] [--ink:var(--color-voucher-ink)]",
  offers: "[--hue:var(--color-offer)] [--ink:var(--color-offer-ink)]",
  catalogs: "[--hue:var(--color-catalog)] [--ink:var(--color-catalog-ink)]",
};

/** The icon each list carried in the old section row. */
const BADGE_ICONS: Record<MarketplaceScope, IconType> = {
  pools: RiGroupLine,
  vouchers: RiCoupon3Line,
  offers: RiStore2Line,
  catalogs: RiBookOpenLine,
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
      {credit}
      {(Object.keys(labels) as MarketplaceScope[]).map((scope) => {
        const active = scope === current;
        const Icon = BADGE_ICONS[scope];
        return (
          <Button
            key={scope}
            asChild
            variant="outline"
            tap
            className={cn(
              "font-semibold text-(--ink) hover:text-(--ink)",
              BADGE_HUES[scope],
              active &&
                "border-(--hue)! bg-[color-mix(in_oklab,var(--hue)_14%,var(--color-card))] text-(--ink) shadow-[inset_0_0_0_1px_var(--hue)] hover:bg-[color-mix(in_oklab,var(--hue)_14%,var(--color-card))] hover:text-(--ink)",
            )}
          >
            {/* The open list's badge leads back to the map. */}
            {active ? (
              <Link to="/" search={(previous) => mapSearchFrom(previous)} aria-current="page">
                <Icon aria-hidden="true" />
                {labels[scope]}
              </Link>
            ) : (
              <Link
                to="/market"
                search={(previous) =>
                  marketplaceSearchForScope(pickMarketplaceSearch(previous), scope)
                }
              >
                <Icon aria-hidden="true" />
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
