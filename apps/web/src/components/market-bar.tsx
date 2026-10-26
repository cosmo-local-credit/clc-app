import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import type { IconType } from "react-icons";
import { RiApps2Line, RiArticleLine, RiMap2Line, RiNotification3Line } from "react-icons/ri";

import { AppMenu } from "#/components/app-menu";
import { POST_RESOURCE_HUE, RESOURCE_HUE, RESOURCE_ICON } from "#/components/resource-tone";
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
import {
  MARKET_MAP_RESOURCE_KINDS,
  type MarketMapResourceKind,
} from "#/features/home/hooks/use-market-map-resource-selection";

/** Where the bar stands: the map, or one of the lists its badges open. */
export type MarketSurface = "map" | MarketListScope | "posts" | "activity";

// All is every resource at once, so it takes no resource's hue: it reads in
// the foreground, like the feeds beside it.
const LIST_HUE: Record<MarketListScope, string> = {
  all: "[--hue:var(--color-foreground)] [--ink:var(--color-foreground)]",
  ...RESOURCE_HUE,
};

const LIST_ICON: Record<MarketListScope, IconType> = { all: RiApps2Line, ...RESOURCE_ICON };

function useMarketSurfaceClassName(surface: "map" | "page") {
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

  return surface === "map"
    ? "bg-transparent"
    : cn(
        "border-b bg-background pb-2 transition-colors",
        scrolled ? "border-border" : "border-transparent",
      );
}

function MarketControlsRow({
  search,
  filters,
  trailing,
}: {
  search: ReactNode;
  filters: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div data-slot="market-controls" className="flex items-center gap-2">
      <AppMenu />
      <div
        data-slot="market-search-control"
        className="flex h-11 min-w-0 flex-1 items-center border border-input bg-card focus-within:border-foreground"
      >
        {search}
        {filters}
      </div>
      {trailing}
    </div>
  );
}

/**
 * The market's top bar, the same over the map and above every list: the app
 * menu on its own square, the search field with the filter button joined to
 * its end, and beside them Credit for a member or Sign in for a guest. The
 * badges below open the lists. The bottom Market control owns map/list
 * switching, so this shell does not add another floating Map action.
 */
export function MarketBar({
  current,
  filter,
  searchLabel,
  filters,
  credit,
  surface = "page",
  className,
  mapResources,
  progress,
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
  mapResources?: {
    selected: readonly MarketMapResourceKind[];
    allSelected: boolean;
    toggle: (kind: MarketMapResourceKind) => void;
    toggleAll: () => void;
  };
  progress?: ReactNode;
}) {
  const auth = useAuthStatus();
  const [searchOpen, setSearchOpen] = useState(false);
  const surfaceClassName = useMarketSurfaceClassName(surface);

  return (
    <div className={cn("space-y-2", surfaceClassName, className)}>
      <MarketControlsRow
        search={
          <MarketSearchField
            filter={filter}
            label={searchLabel}
            onOpen={() => setSearchOpen(true)}
          />
        }
        filters={filters}
        trailing={
          <>
            {auth.isAuthenticated ? credit : null}
            {!auth.isLoading && !auth.isAuthenticated ? (
              <Button asChild size="lg">
                <Link to="/onboarding" search={onboardingSearch("welcome")}>
                  <Trans>Sign in</Trans>
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {surface === "map" && mapResources ? (
        <MarketMapResourceToggles {...mapResources} />
      ) : (
        <MarketBadges current={current} />
      )}
      {progress}
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
    </div>
  );
}

function MarketMapResourceToggles({
  selected,
  allSelected,
  toggle,
  toggleAll,
}: {
  selected: readonly MarketMapResourceKind[];
  allSelected: boolean;
  toggle: (kind: MarketMapResourceKind) => void;
  toggleAll: () => void;
}) {
  const { t } = useLingui();
  const config: Record<MarketMapResourceKind, { label: string; icon: IconType; tone: string }> = {
    voucher: { label: t`Vouchers`, icon: RESOURCE_ICON.vouchers, tone: LIST_HUE.vouchers },
    want: { label: t`Wants`, icon: RESOURCE_ICON.wants, tone: LIST_HUE.wants },
    pool: { label: t`Pools`, icon: RESOURCE_ICON.pools, tone: LIST_HUE.pools },
    catalog: { label: t`Catalogs`, icon: RESOURCE_ICON.catalogs, tone: LIST_HUE.catalogs },
    post: {
      label: t`Posts`,
      icon: RiArticleLine,
      tone: POST_RESOURCE_HUE,
    },
  };

  return (
    <div
      role="group"
      aria-label={t`Resources shown on the map`}
      className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <MapResourceToggle
        label={t`All`}
        icon={RiApps2Line}
        pressed={allSelected}
        tone={LIST_HUE.all}
        onClick={toggleAll}
      />
      {MARKET_MAP_RESOURCE_KINDS.map((kind) => {
        const item = config[kind];
        return (
          <MapResourceToggle
            key={kind}
            label={item.label}
            icon={item.icon}
            pressed={selected.includes(kind)}
            tone={item.tone}
            onClick={() => toggle(kind)}
          />
        );
      })}
    </div>
  );
}

function MapResourceToggle({
  label,
  icon: Icon,
  pressed,
  tone,
  onClick,
}: {
  label: string;
  icon: IconType;
  pressed: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      tap
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "font-semibold text-(--ink) hover:text-(--ink)",
        tone,
        pressed &&
          "border-(--hue)! bg-[color-mix(in_oklab,var(--hue)_14%,var(--color-card))] shadow-[inset_0_0_0_1px_var(--hue)] hover:bg-[color-mix(in_oklab,var(--hue)_14%,var(--color-card))]",
      )}
    >
      <Icon aria-hidden="true" />
      {label}
    </Button>
  );
}

function MarketBadges({ current }: { current: MarketSurface }) {
  const { t } = useLingui();
  const labels: Record<MarketListScope, string> = {
    all: t`All`,
    offers: t`Offers`,
    wants: t`Wants`,
    vouchers: t`Vouchers`,
    pools: t`Pools`,
    catalogs: t`Catalogs`,
  };
  const scopes: MarketListScope[] = ["all", "offers", "wants", "vouchers", "pools", "catalogs"];
  return (
    <nav
      aria-label={t`Marketplace sections`}
      className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {scopes.map((scope) => {
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
            className={cn(
              "font-semibold",
              tab === "posts" && "text-(--ink) hover:text-(--ink)",
              tab === "posts" && POST_RESOURCE_HUE,
              active &&
                (tab === "posts"
                  ? "border-(--hue)! bg-[color-mix(in_oklab,var(--hue)_14%,var(--color-card))]"
                  : "border-foreground bg-muted"),
            )}
          >
            <Link to="/" search={active ? {} : { tab }} aria-current={active ? "page" : undefined}>
              <Icon aria-hidden="true" />
              {tab === "posts" ? t`Posts` : t`Activity`}
            </Link>
          </Button>
        );
      })}
      <Button
        asChild
        variant="outline"
        tap
        className={cn("font-semibold", current === "map" && "border-foreground bg-muted")}
      >
        <Link
          to={current === "map" ? "/market" : "/"}
          search={(previous) =>
            current === "map"
              ? marketplaceSearchForScope(pickMarketplaceSearch(previous), "all")
              : mapSearchFrom(previous)
          }
          aria-current={current === "map" ? "page" : undefined}
        >
          <RiMap2Line aria-hidden="true" />
          <Trans>Map</Trans>
        </Link>
      </Button>
    </nav>
  );
}

/** Section navigation for feeds with their own search controls. */
export function MarketFeedBar({
  current,
  search,
  filters,
}: {
  current: "activity" | "posts";
  search: ReactNode;
  filters: ReactNode;
}) {
  const surfaceClassName = useMarketSurfaceClassName("page");

  return (
    <div
      className={cn(
        "sticky top-0 z-20 space-y-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]",
        surfaceClassName,
      )}
    >
      <MarketControlsRow search={search} filters={filters} />
      <MarketBadges current={current} />
    </div>
  );
}
