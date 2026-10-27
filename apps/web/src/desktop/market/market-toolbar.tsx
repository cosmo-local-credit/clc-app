import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiCloseLine, RiSearchLine } from "react-icons/ri";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import type { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import {
  marketplaceSearchForScope,
  marketplaceSharedSearch,
  type MarketListScope,
} from "#/lib/navigation/marketplace-search";
import { cn } from "#/lib/utils";
import { DeskKbd } from "#/desktop/ui/kbd";
import { DeskChip, DeskSegment, DeskSegmentItem } from "#/desktop/ui/segment";
import { DeskTab, DeskTabs } from "#/desktop/ui/tabs";

const SCOPES: { id: MarketListScope; label: ReactNode }[] = [
  { id: "all", label: <Trans>All</Trans> },
  { id: "offers", label: <Trans>Offers</Trans> },
  { id: "wants", label: <Trans>Wants</Trans> },
  { id: "vouchers", label: <Trans>Vouchers</Trans> },
  { id: "pools", label: <Trans>Pools</Trans> },
  { id: "catalogs", label: <Trans>Catalogs</Trans> },
];

type Credit = ReturnType<typeof useCreditableBrowse>;

/**
 * Search, Filters, Credit, the result count and Map | List over the scope
 * tabs. `column` is the map's 400px results column; `page` is the list.
 */
export function MarketDeskToolbar({
  layout,
  scope,
  filter,
  facets,
  filtersOpen,
  onFiltersOpenChange,
  credit,
  onCredit,
  count,
}: {
  layout: "column" | "page";
  scope: MarketListScope;
  filter: MarketFilterControls;
  facets: { tag: string; count: number }[];
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  credit: Credit;
  onCredit: (checked: boolean) => void;
  /** Shown beside the chips on the list; the column draws its own count row. */
  count?: number;
}) {
  const { t } = useLingui();
  const view = layout === "column" ? "map" : "list";
  const search = <MarketSearchField filter={filter} scope={scope} column={layout === "column"} />;
  const chips = (
    <>
      <FiltersChip
        filter={filter}
        facets={facets}
        open={filtersOpen}
        onOpenChange={onFiltersOpenChange}
      />
      <CreditChip credit={credit} onCredit={onCredit} />
    </>
  );
  const segment = (
    <DeskSegment label={t`View`} className="ms-auto">
      <DeskSegmentItem active={view === "map"}>
        <MarketLink scope={scope} view="map">
          <Trans>Map</Trans>
        </MarketLink>
      </DeskSegmentItem>
      <DeskSegmentItem active={view === "list"}>
        <MarketLink scope={scope} view="list">
          <Trans>List</Trans>
        </MarketLink>
      </DeskSegmentItem>
    </DeskSegment>
  );
  const tabs = (
    <DeskTabs
      label={t`Marketplace`}
      tight={layout === "column"}
      className={layout === "column" ? "-mx-3.5 border-b-0 px-1" : undefined}
    >
      {SCOPES.map((entry) => (
        <DeskTab key={entry.id} active={entry.id === scope}>
          <MarketLink scope={entry.id} view={view}>
            {entry.label}
          </MarketLink>
        </DeskTab>
      ))}
    </DeskTabs>
  );

  if (layout === "column") {
    return (
      <div className="grid shrink-0 gap-2.5 border-border border-b px-3.5 pt-3.5">
        {search}
        <div className="flex min-w-0 items-center gap-1.5">
          {chips}
          {segment}
        </div>
        {tabs}
      </div>
    );
  }
  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex min-w-0 items-center gap-2">
        <div className="w-[420px] min-w-0 shrink">{search}</div>
        {chips}
        {count !== undefined ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            <Trans>{count} results</Trans>
          </span>
        ) : null}
        {segment}
      </div>
      {tabs}
    </div>
  );
}

function MarketSearchField({
  filter,
  scope,
  column,
}: {
  filter: MarketFilterControls;
  scope: MarketListScope;
  column: boolean;
}) {
  const { t } = useLingui();
  const label =
    scope === "offers"
      ? t`Search offers, vouchers, descriptions, or tags`
      : scope === "wants"
        ? t`Search Wants`
        : scope === "vouchers"
          ? t`Search vouchers`
          : scope === "pools"
            ? t`Search pools`
            : scope === "catalogs"
              ? t`Search catalogs`
              : t`Search the marketplace`;
  return (
    <div className="relative min-w-0">
      <RiSearchLine
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={filter.term}
        onChange={(event) => filter.setTerm(event.target.value)}
        placeholder={label}
        aria-label={label}
        // The map has no top bar, so `/` focuses this field there.
        data-desktop-search={column ? "" : undefined}
        className="truncate ps-9 pe-10"
      />
      {filter.term !== "" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t`Clear search`}
          onClick={filter.clearTerm}
          className="absolute end-0 top-0 border-0 text-muted-foreground"
        >
          <RiCloseLine aria-hidden="true" />
        </Button>
      ) : column ? (
        <DeskKbd className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2">/</DeskKbd>
      ) : null}
    </div>
  );
}

/**
 * The shared filter sheet, its trigger dressed as a chip. The sheet copies the
 * applied filter into its draft when its own trigger opens it, so the trigger
 * stays the sheet's and only its look changes here.
 */
function FiltersChip({
  filter,
  facets,
  open,
  onOpenChange,
}: {
  filter: MarketFilterControls;
  facets: { tag: string; count: number }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <span
      className={cn(
        "contents",
        "[&>button]:h-[30px] [&>button]:gap-1.5 [&>button]:border-foreground/25 [&>button]:bg-card [&>button]:px-2.5 [&>button]:text-foreground [&>button]:hover:bg-muted",
        "[&>button>span]:border-transparent [&>button>span]:bg-foreground [&>button>span]:text-background",
      )}
    >
      <CatalogFilterSheet
        filter={filter}
        facets={facets}
        title={<Trans>Filter vouchers</Trans>}
        facetTitle={<Trans>What they offer</Trans>}
        showHeader={false}
        open={open}
        onOpenChange={onOpenChange}
        onApply={filter.applyFacetFilters}
      />
    </span>
  );
}

/** The Credit filter as a chip: filled while on. Its notices render elsewhere. */
function CreditChip({
  credit,
  onCredit,
}: {
  credit: Credit;
  onCredit: (checked: boolean) => void;
}) {
  if (!credit.parsed.ok || !credit.auth.isAuthenticated) return null;
  const checking = credit.enabled && credit.verification.status === "loading";
  return (
    <DeskChip on={credit.enabled}>
      <button
        type="button"
        aria-pressed={credit.enabled}
        aria-busy={checking}
        disabled={credit.auth.isLoading}
        onClick={() => onCredit(!credit.enabled)}
        className="disabled:opacity-50"
      >
        {checking ? <Spinner /> : null}
        <Trans>Credit</Trans>
      </button>
    </DeskChip>
  );
}

/** One scope in one view. All on the map is the home map; every other pairing lives on /market. */
function MarketLink({
  scope,
  view,
  children,
  ...props
}: {
  scope: MarketListScope;
  view: "map" | "list";
  children: ReactNode;
  className?: string;
}) {
  const home = view === "map" && scope === "all";
  return (
    <Link
      {...props}
      to={home ? "/" : "/market"}
      search={(previous) =>
        home
          ? { ...marketplaceSharedSearch(previous), tab: "market" as const, view: "map" as const }
          : { ...marketplaceSearchForScope(marketplaceSharedSearch(previous), scope), view }
      }
    >
      {children}
    </Link>
  );
}
