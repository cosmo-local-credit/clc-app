import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { ReportPoolFacet, ReportVoucherFacet } from "@clc/api/features/reports/client";
import { CATALOG_MAX_TAGS } from "@clc/core/features/catalog/logic";
import type { PostTiming } from "@clc/core/features/reports/logic";
import { RiCheckLine, RiCloseLine, RiFilter3Line } from "react-icons/ri";

import { useCreditStateLabel } from "#/components/creditable-browse-control";
import { Button } from "#/components/ui/button";
import { PopoverContent, PopoverRoot, PopoverTitle, PopoverTrigger } from "#/components/ui/popover";
import { SectionHeading } from "#/components/ui/section-heading";
import { Spinner } from "#/components/ui/spinner";
import { SelectableTagBadge } from "#/components/ui/tag-badge";
import { Toggle } from "#/components/ui/toggle";
import { useCatalogFilterDraft } from "#/components/use-catalog-filter-draft";
import type { useCreditableBrowse } from "#/features/home/hooks/use-creditable-browse";
import type { MarketFilterControls } from "#/features/home/hooks/use-market-filter";
import type { OutputVoucherBrowse } from "#/features/home/hooks/use-output-voucher-browse";
import {
  marketplaceSearchForScope,
  marketplaceSharedSearch,
  type MarketListScope,
  parseMarketplaceScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";
import { cn } from "#/lib/utils";
import { MapLayersChip, type MapLayers } from "#/desktop/market/market-layers";
import { MarketSearchField } from "#/desktop/market/market-search-field";
import { DeskChip, DeskSegment, DeskSegmentItem } from "#/desktop/ui/segment";
import { PostFacets } from "#/desktop/posts/post-facets";

type MarketPostFilters = {
  timing: PostTiming;
  onTimingChange: (next: PostTiming) => void;
  voucherFacets: ReportVoucherFacet[];
  poolFacets: ReportPoolFacet[];
  postsOnly: boolean;
};

type Credit = ReturnType<typeof useCreditableBrowse>;

/**
 * Search, Filters, Credit, the requested output, the result count and
 * Map | List. `column` is the map's 400px results column; `page` is one full
 * resource list. Resource navigation lives in the desktop sidebar.
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
  output,
  onClearOutput,
  layers,
  count,
  refreshing = false,
  postFilters,
}: {
  layout: "column" | "page";
  scope: MarketListScope;
  filter: MarketFilterControls;
  facets: { tag: string; count: number }[];
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  credit: Credit;
  /** The toggled Credit state: true turns it on. */
  onCredit: (on: boolean) => void;
  output: OutputVoucherBrowse;
  onClearOutput: () => void;
  /** The map's resource types, only while the All scope draws them. */
  layers?: MapLayers;
  /** Shown beside the chips on the list; the column draws its own count row. */
  count?: number;
  /** The list is refreshing behind the rows it still shows. */
  refreshing?: boolean;
  postFilters?: MarketPostFilters;
}) {
  const { t } = useLingui();
  const view = layout === "column" ? "map" : "list";
  const search = (
    <MarketSearchFieldFor filter={filter} scope={scope} column={layout === "column"} />
  );
  const chips = (
    <>
      <FiltersChip
        scope={scope}
        filter={filter}
        facets={facets}
        open={filtersOpen}
        onOpenChange={onFiltersOpenChange}
        postFilters={postFilters}
      />
      <CreditChip credit={credit} onCredit={onCredit} />
      {layers ? <MapLayersChip layers={layers} /> : null}
      <OutputChip output={output} onClear={onClearOutput} />
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
  if (layout === "column") {
    return (
      <div className="grid shrink-0 gap-2.5 px-3.5 pt-3.5">
        {search}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {chips}
          {segment}
        </div>
      </div>
    );
  }
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="w-[420px] max-w-full min-w-0 shrink">{search}</div>
        {chips}
        {count !== undefined ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            {refreshing ? <Spinner /> : null}
            <Trans>{count} results</Trans>
          </span>
        ) : refreshing ? (
          <span
            role="status"
            className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Spinner />
            <Trans>Updating…</Trans>
          </span>
        ) : null}
        {segment}
      </div>
    </div>
  );
}

function MarketSearchFieldFor({
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
      ? t`Search offers`
      : scope === "wants"
        ? t`Search Wants`
        : scope === "vouchers"
          ? t`Search vouchers`
          : scope === "pools"
            ? t`Search pools`
            : scope === "catalogs"
              ? t`Search catalogs`
              : t`Search the marketplace`;
  return <MarketSearchField filter={filter} label={label} column={column} />;
}

/**
 * Filters as a popover under its chip. The draft is the phone sheet's: edits
 * stay local until Apply, which writes one canonical URL.
 */
function FiltersChip({
  scope,
  filter,
  facets,
  open,
  onOpenChange,
  postFilters,
}: {
  scope: MarketListScope;
  filter: MarketFilterControls;
  facets: { tag: string; count: number }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postFilters?: MarketPostFilters;
}) {
  const { t } = useLingui();
  const draft = useCatalogFilterDraft({
    filter,
    facets,
    onOpenChange,
    onApply: filter.applyFacetFilters,
  });
  const searchTerm = draft.searchTerm;
  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next) => (next ? draft.begin() : draft.changeOpen(false))}
    >
      <DeskChip on={open}>
        <PopoverTrigger>
          <RiFilter3Line aria-hidden="true" />
          <Trans>Filters</Trans>
          {draft.appliedCount > 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                "min-w-4 px-1 text-center font-mono text-2xs font-semibold",
                open ? "bg-background text-foreground" : "bg-foreground text-background",
              )}
            >
              {draft.appliedCount}
            </span>
          ) : null}
        </PopoverTrigger>
      </DeskChip>
      <PopoverContent align="start" className="grid w-96 gap-4 p-0">
        {postFilters ? (
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <PostFacets
              filter={filter}
              tagFacets={facets}
              voucherFacets={postFilters.voucherFacets}
              poolFacets={postFilters.poolFacets}
              timing={postFilters.timing}
              onTimingChange={postFilters.onTimingChange}
              ariaLabel={postFilters.postsOnly ? t`Filter posts` : t`Filter marketplace`}
            />
          </div>
        ) : (
          <>
            <div className="flex h-12 items-center justify-between gap-3 border-border border-b px-4">
              <PopoverTitle className="font-heading text-base font-semibold">
                {scope === "offers" ? (
                  <Trans>Filter offers</Trans>
                ) : scope === "wants" ? (
                  <Trans>Filter Wants</Trans>
                ) : scope === "vouchers" ? (
                  <Trans>Filter vouchers</Trans>
                ) : scope === "pools" ? (
                  <Trans>Filter pools</Trans>
                ) : scope === "catalogs" ? (
                  <Trans>Filter catalogs</Trans>
                ) : (
                  <Trans>Filter marketplace</Trans>
                )}
              </PopoverTitle>
              <span className="text-xs text-muted-foreground">
                <Trans>
                  {draft.draftTags.length} of {CATALOG_MAX_TAGS}
                </Trans>
              </span>
            </div>
            <section className="grid gap-3 px-4" aria-label={t`Filter by tag`}>
              <SectionHeading variant="group" as="h3">
                {scope === "vouchers" ? <Trans>What they offer</Trans> : <Trans>Tags</Trans>}
              </SectionHeading>
              {facets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  <Trans>No category filters are available.</Trans>
                </p>
              ) : draft.hasSelectableFacet ? (
                <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto" role="group">
                  {facets.map((facet) => {
                    const selected = draft.draftTags.includes(facet.tag);
                    return (
                      <SelectableTagBadge
                        key={facet.tag}
                        tag={facet.tag}
                        selected={selected}
                        count={draft.showCounts ? facet.count : undefined}
                        disabled={!selected && (facet.count === 0 || draft.atTagLimit)}
                        onClick={() => draft.toggleDraftTag(facet.tag)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-sm text-muted-foreground">
                    {searchTerm !== "" ? (
                      <Trans>Nothing matching “{searchTerm}” carries a category.</Trans>
                    ) : (
                      <Trans>No categories are available for the current results.</Trans>
                    )}
                  </p>
                  {draft.searchTerm !== "" ? (
                    <Button variant="outline" onClick={filter.clearTerm}>
                      <Trans>Clear search</Trans>
                    </Button>
                  ) : null}
                </div>
              )}
            </section>
            {draft.draftTags.length > 1 ? (
              <section className="grid gap-3 px-4">
                <SectionHeading variant="group" as="h3">
                  <Trans>How should categories match?</Trans>
                </SectionHeading>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label={t`Match`}>
                  {(["any", "all"] as const).map((match) => (
                    <Toggle
                      key={match}
                      variant="outline"
                      pressed={draft.draftTagMatch === match}
                      onPressedChange={(pressed) => {
                        if (pressed) draft.setDraftTagMatch(match);
                      }}
                      className="data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
                    >
                      {draft.draftTagMatch === match ? <RiCheckLine aria-hidden="true" /> : null}
                      {match === "any" ? t`Any selected` : t`All selected`}
                    </Toggle>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="flex justify-end gap-2 border-border border-t px-4 py-3">
              <Button variant="outline" disabled={!draft.canReset} onClick={draft.reset}>
                <Trans>Reset</Trans>
              </Button>
              <Button onClick={draft.apply}>
                <RiCheckLine aria-hidden="true" />
                <Trans>Apply filters</Trans>
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}

/** The Credit filter as a chip that toggles: filled while on. Its notices render elsewhere. */
function CreditChip({ credit, onCredit }: { credit: Credit; onCredit: (on: boolean) => void }) {
  const label = useCreditStateLabel(credit.enabled);
  if (!credit.auth.isAuthenticated) return null;
  const checking = credit.enabled && credit.verification.status === "loading";
  return (
    <DeskChip on={credit.enabled}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={credit.enabled}
        aria-busy={checking}
        disabled={credit.auth.isLoading}
        onClick={() => onCredit(!credit.enabled)}
        className="disabled:opacity-50"
      >
        {checking ? <Spinner /> : credit.enabled ? <RiCheckLine aria-hidden="true" /> : null}
        <Trans>Credit</Trans>
      </button>
    </DeskChip>
  );
}

/** The requested output voucher, as a removable chip: Get BAKE. */
function OutputChip({ output, onClear }: { output: OutputVoucherBrowse; onClear: () => void }) {
  const { t } = useLingui();
  if (!output.active) return null;
  const symbol = output.symbol;
  const label = symbol ? t`Get ${symbol}` : t`Get voucher`;
  return (
    <DeskChip on>
      <button
        type="button"
        aria-label={t`Remove filter: ${label}`}
        aria-busy={output.state === "loading"}
        onClick={onClear}
      >
        {output.state === "loading" ? <Spinner /> : null}
        {symbol ? (
          <Trans>
            Get <span className="font-mono">{symbol}</span>
          </Trans>
        ) : (
          <Trans>Get voucher</Trans>
        )}
        <RiCloseLine aria-hidden="true" />
      </button>
    </DeskChip>
  );
}

/**
 * The map is unified; List opens the current full-page resource scope (All
 * from the map). Compatible filters travel in both directions.
 */
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
  const home = view === "map";
  return (
    <Link
      {...props}
      to={home ? "/" : "/market"}
      search={(previous) =>
        home
          ? { ...marketplaceSharedSearch(previous), tab: "market" as const, view: "map" as const }
          : {
              ...marketplaceSearchForScope(
                { ...marketplaceSharedSearch(previous), out_voucher: keptOutput(previous, scope) },
                scope,
              ),
              view,
            }
      }
    >
      {children}
    </Link>
  );
}

function keptOutput(previous: unknown, scope: MarketListScope) {
  if (scope !== "pools") return undefined;
  const state = pickMarketplaceSearch(previous);
  return parseMarketplaceScope(state.scope) === "pools" ? state.out_voucher : undefined;
}
