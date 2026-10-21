import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import type { IconType } from "react-icons";
import { RiApps2Line, RiArticleLine, RiNotification3Line, RiMap2Line } from "react-icons/ri";

import { AppMenu } from "#/components/app-menu";
import { RESOURCE_HUE, RESOURCE_ICON } from "#/components/resource-tone";
import { MarketSearchField, MarketSearchScreen } from "#/components/market-search";
import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import {
  mapSearchFrom,
  type MarketListScope,
  marketplaceSearchForScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import type { PersistedCatalogFilterControls } from "#/lib/navigation/use-persisted-catalog-filter";
import { onboardingSearch } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";

/** Where the bar stands: the map, or one of the lists its badges open. */
export type MarketSurface = "map" | MarketListScope | "posts" | "activity";

// All is every resource at once, so it takes no resource's hue: it reads in
// the foreground, like the feeds beside it.
const LIST_HUE: Record<MarketListScope, string> = {
  all: "[--hue:var(--color-foreground)] [--ink:var(--color-foreground)]",
  ...RESOURCE_HUE,
};

const LIST_ICON: Record<MarketListScope, IconType> = { all: RiApps2Line, ...RESOURCE_ICON };

/**
 * The market's top bar, the same over the map and above every list: the app
 * menu on its own square, the search field with the filter button joined to
 * its end, and beside them Credit for a member or Sign in for a guest. The
 * badges below open the lists; in a list, a Map button floats above the
 * navigation.
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
  /** The Credit filter, beside the search field for a signed-in member. */
  credit?: ReactNode;
  surface?: "map" | "page";
  className?: string;
}) {
  const auth = useAuthStatus();
  const [searchOpen, setSearchOpen] = useState(false);
  // Above a list the bar draws its edge only once rows scroll beneath it; at
  // rest the list starts straight under the badges with no line between.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (surface === "map") return;
    const update = () => setScrolled(window.scrollY > 0);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [surface]);
  const surfaceClassName =
    surface === "map"
      ? "bg-transparent"
      : cn(
          "border-b bg-background pb-2 transition-colors",
          scrolled ? "border-border" : "border-transparent",
        );

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
        {auth.isAuthenticated ? credit : null}
        {!auth.isLoading && !auth.isAuthenticated ? (
          <Button asChild size="lg">
            <Link to="/onboarding" search={onboardingSearch("welcome")}>
              <Trans>Sign in</Trans>
            </Link>
          </Button>
        ) : null}
      </div>
      <MarketBadges current={current} />
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

function MarketBadges({ current }: { current: MarketSurface }) {
  const { t } = useLingui();
  const labels: Record<MarketListScope, string> = {
    all: t`All`,
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
      {(Object.keys(labels) as MarketListScope[]).map((scope) => {
        const active = scope === current;
        const Icon = LIST_ICON[scope];
        return (
          <Button
            key={scope}
            asChild
            variant="outline"
            tap
            className={cn(
              "font-semibold text-(--ink) hover:text-(--ink)",
              LIST_HUE[scope],
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
      {(["activity", "posts"] as const).map((tab) => {
        const active = current === tab;
        const Icon = tab === "posts" ? RiArticleLine : RiNotification3Line;
        return (
          <Button
            key={tab}
            asChild
            variant="outline"
            tap
            className={cn("font-semibold", active && "border-foreground bg-muted")}
          >
            <Link to="/" search={active ? {} : { tab }} aria-current={active ? "page" : undefined}>
              <Icon aria-hidden="true" />
              {tab === "posts" ? t`Posts` : t`Activity`}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

function MarketMapButton({ resetSearch = false }: { resetSearch?: boolean }) {
  const { t } = useLingui();
  return (
    <Link
      to="/"
      search={(previous) => (resetSearch ? {} : mapSearchFrom(previous))}
      aria-label={t`Map`}
      title={t`Map`}
      className="fixed end-4 bottom-[calc(max(var(--bottom-nav-offset),env(safe-area-inset-bottom))+1rem)] z-20 flex size-14 items-center justify-center bg-primary text-primary-foreground outline-none transition-colors hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
    >
      <RiMap2Line className="size-6" aria-hidden="true" />
    </Link>
  );
}

/** Section navigation for feeds with their own search controls. */
export function MarketFeedBar({
  current,
  children,
}: {
  current: "activity" | "posts";
  children: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 space-y-2 bg-background pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      {children}
      <MarketBadges current={current} />
      <MarketMapButton resetSearch />
    </div>
  );
}
