import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiSearchLine } from "react-icons/ri";

import { CreditableBrowseControl } from "#/components/creditable-browse-control";
import { Input } from "#/components/ui/input";
import { MarketFilterSheet } from "#/features/home/ui/market-filter-ui";
import type { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import {
  marketplaceSearchForScope,
  marketplaceSharedSearch,
  type MarketListScope,
} from "#/lib/navigation/marketplace-search";
import { cn } from "#/lib/utils";

const SCOPES: { id: MarketListScope; label: ReactNode }[] = [
  { id: "all", label: <Trans>All</Trans> },
  { id: "offers", label: <Trans>Offers</Trans> },
  { id: "wants", label: <Trans>Wants</Trans> },
  { id: "vouchers", label: <Trans>Vouchers</Trans> },
  { id: "pools", label: <Trans>Pools</Trans> },
  { id: "catalogs", label: <Trans>Catalogs</Trans> },
];

export function MarketDeskToolbar({
  scope,
  view,
  filter,
  facets,
  filtersOpen,
  onFiltersOpenChange,
  credit,
  onCredit,
  onClearCredit,
  count,
  searchAttribute = false,
}: {
  scope: MarketListScope;
  view: "map" | "list";
  filter: MarketFilterControls;
  facets: { tag: string; count: number }[];
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  credit: ReturnType<typeof useCreditableBrowse>;
  onCredit: (checked: boolean) => void;
  onClearCredit: () => void;
  count?: number;
  /** The map has no top bar, so `/` focuses this field. */
  searchAttribute?: boolean;
}) {
  const { t } = useLingui();
  return (
    <div className="flex flex-col gap-3 border-border border-b p-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <RiSearchLine
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={filter.term}
            onChange={(event) => filter.setTerm(event.target.value)}
            placeholder={t`Search the marketplace`}
            aria-label={t`Search the marketplace`}
            data-desktop-search={searchAttribute ? "" : undefined}
            className="ps-9"
          />
        </div>
        <MarketFilterSheet
          filter={filter}
          facets={facets}
          open={filtersOpen}
          onOpenChange={onFiltersOpenChange}
        />
        <CreditableBrowseControl
          part="control"
          state={credit}
          onChange={onCredit}
          onClear={onClearCredit}
        />
        {count !== undefined ? (
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">
            <Trans>{count} results</Trans>
          </span>
        ) : null}
        <div className="ms-auto flex border border-border">
          <ViewLink scope={scope} view="map" current={view}>
            <Trans>Map</Trans>
          </ViewLink>
          <ViewLink scope={scope} view="list" current={view}>
            <Trans>List</Trans>
          </ViewLink>
        </div>
      </div>
      <div className="flex gap-1" role="tablist">
        {SCOPES.map((entry) => (
          <ScopeTab key={entry.id} id={entry.id} current={scope} view={view}>
            {entry.label}
          </ScopeTab>
        ))}
      </div>
    </div>
  );
}

function ScopeTab({
  id,
  current,
  view,
  children,
}: {
  id: MarketListScope;
  current: MarketListScope;
  view: "map" | "list";
  children: ReactNode;
}) {
  const on = id === current;
  return (
    <Link
      to={view === "map" && id === "all" ? "/" : "/market"}
      search={(previous) =>
        view === "map" && id === "all"
          ? { ...marketplaceSharedSearch(previous), tab: "market" as const, view: "map" as const }
          : {
              ...marketplaceSearchForScope(marketplaceSharedSearch(previous), id),
              view,
            }
      }
      role="tab"
      aria-selected={on}
      className={cn(
        "px-3 py-1.5 text-sm",
        on
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function ViewLink({
  scope,
  view,
  current,
  children,
}: {
  scope: MarketListScope;
  view: "map" | "list";
  current: "map" | "list";
  children: ReactNode;
}) {
  const on = view === current;
  // Home drops `view=list`, so the list of everything lives on /market.
  const toList = view === "list";
  return (
    <Link
      to={toList || scope !== "all" ? "/market" : "/"}
      search={(previous) => {
        const shared = marketplaceSharedSearch(previous);
        if (!toList && scope === "all") {
          return { ...shared, tab: "market" as const, view: "map" as const };
        }
        return {
          ...marketplaceSearchForScope(shared, scope),
          view,
        };
      }}
      aria-current={on ? "page" : undefined}
      className={cn(
        "px-3 py-1.5 text-sm",
        on ? "bg-foreground text-background" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}
