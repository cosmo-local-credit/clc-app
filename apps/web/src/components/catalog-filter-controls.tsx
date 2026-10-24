import { useNearbyCatalogFilter } from "#/components/nearby-catalog";
import {
  CATALOG_MAX_TAGS,
  CATALOG_MAX_VOUCHERS,
  type TagMatch,
  type VoucherRef,
  formatVoucherAddress,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useMemo, useState, type ReactNode } from "react";
import { RiCheckLine, RiCloseLine, RiFilter3Line, RiSearchLine } from "react-icons/ri";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "#/components/ui/combobox";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { SectionHeading } from "#/components/ui/section-heading";
import { SelectableTagBadge } from "#/components/ui/tag-badge";
import { Toggle } from "#/components/ui/toggle";
import type { MarketVoucher } from "@clc/api/features/market/client";
import {
  VOUCHER_SEARCH_MIN_CHARS,
  type VoucherSearchControls,
} from "#/features/home/hooks/use-voucher-search";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { cn } from "#/lib/utils";

export function CatalogSearchField({
  filter,
  label,
  embedded = false,
}: {
  filter: CatalogFilterControls;
  label: string;
  embedded?: boolean;
}) {
  const { t } = useLingui();

  return (
    <div className={cn("relative", embedded && "h-full min-w-0 flex-1")}>
      <RiSearchLine
        className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={filter.term}
        onChange={(event) => filter.setTerm(event.target.value)}
        aria-label={label}
        placeholder={label}
        className={cn(
          "appearance-none rounded-none bg-card ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
          embedded && "h-full border-0 pe-11 focus-visible:border-transparent",
        )}
      />
      {filter.term !== "" ? (
        <Button
          variant="ghost"
          size={embedded ? "icon-lg" : "icon"}
          tap={!embedded}
          onClick={filter.clearTerm}
          aria-label={t`Clear search`}
          className={cn(
            "absolute top-1/2 end-0 -translate-y-1/2 border-0 text-muted-foreground focus-visible:border-transparent",
            embedded
              ? "bg-card hover:bg-muted hover:text-foreground"
              : "bg-transparent hover:bg-transparent hover:text-foreground focus-visible:bg-transparent",
          )}
        >
          <RiCloseLine className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

type CatalogFacet = {
  tag: string;
  count: number;
};

export type CatalogVoucherFacet = VoucherRef & {
  name: string;
  symbol: string;
  count: number;
  placeholder?: boolean;
};

/**
 * Carries forward the name of anything newly selected. Search results vanish when the query is
 * cleared, so without this a chip picked a moment ago would fall back to its hex address.
 */
function rememberVoucherNames(
  selected: readonly VoucherRef[],
  results: readonly MarketVoucher[],
  setNames: (
    update: (previous: ReadonlyMap<string, string>) => ReadonlyMap<string, string>,
  ) => void,
) {
  const named = new Map(results.map((voucher) => [serializeVoucherRef(voucher), voucher.name]));
  const additions = selected
    .map(serializeVoucherRef)
    .filter((key) => named.has(key))
    .map((key): [string, string] => [key, named.get(key) ?? ""]);
  if (additions.length === 0) return;
  setNames((previous) => new Map([...previous, ...additions]));
}

/**
 * Shared shadcn/Base UI filter sheet for exhaustive catalogs.
 *
 * Facet edits stay local until Apply, producing one canonical URL navigation and one query.
 * Entity-specific pages supply the title, facet vocabulary, persistence action, and any
 * compact controls that belong before the facets.
 *
 * `open` is owned by the page so the tag facet vocabulary query can stay disabled until the sheet
 * is first opened — the facets are only ever read in here.
 *
 * Voucher filtering is search-driven: nothing is listed at rest, so the sheet keeps its vertical
 * space for the tag facets and Apply. `voucherFacets` is no longer list content — it survives only
 * as a label source for vouchers already applied from a URL or a restored preference.
 */
export function CatalogFilterSheet({
  filter,
  facets,
  title,
  facetTitle,
  voucherFacets,
  voucherSearch,
  showHeader = true,
  open,
  onOpenChange,
  onApply,
  children,
  trigger = "default",
  additionalAppliedCount = 0,
  additionalDraftCount = 0,
  onResetAdditional,
}: {
  filter: CatalogFilterControls;
  facets: readonly CatalogFacet[];
  title: ReactNode;
  facetTitle: ReactNode;
  /** Label source for already-applied vouchers, not list content. */
  voucherFacets?: readonly CatalogVoucherFacet[];
  /** Presence of this enables the voucher section at all. */
  voucherSearch?: VoucherSearchControls;
  showHeader?: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onApply: (
    tags: readonly string[],
    tagMatch: TagMatch,
    vouchers: readonly VoucherRef[],
    voucherMatch: TagMatch,
  ) => void;
  children?: ReactNode;
  /** `bar` is the market bar's square, joined to the end of its search field. */
  trigger?: "default" | "bar";
  additionalAppliedCount?: number;
  /** Draft selections rendered by `children`, used by the shared Reset control. */
  additionalDraftCount?: number;
  onResetAdditional?: () => void;
}) {
  const { t } = useLingui();
  const categoryHeadingId = useId();
  const matchHeadingId = useId();
  const voucherHeadingId = useId();
  const voucherMatchHeadingId = useId();
  const [draftTags, setDraftTags] = useState<readonly string[]>([]);
  const [draftTagMatch, setDraftTagMatch] = useState<TagMatch>("any");
  // Mutable rather than readonly: Base UI types multi-select `selectedValue` as `Value[]`.
  const [draftVouchers, setDraftVouchers] = useState<VoucherRef[]>([]);
  const [draftVoucherMatch, setDraftVoucherMatch] = useState<TagMatch>("any");
  // Names of vouchers picked in this session. Search results are transient — once the query is
  // cleared the result that produced a chip is gone, so its label has to be kept here.
  const [pickedVoucherNames, setPickedVoucherNames] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );

  const appliedCount = filter.result.ok
    ? filter.tags.length + filter.vouchers.length + additionalAppliedCount
    : "requested" in filter.result
      ? filter.result.requested
      : 0;
  const atTagLimit = draftTags.length >= CATALOG_MAX_TAGS;
  const atVoucherLimit = draftVouchers.length >= CATALOG_MAX_VOUCHERS;
  // Disjunctive counts describe what a chip adds under Any. They ignore the selected tags,
  // so showing them under All would imply a conjunctive count the backend did not compute.
  // Server facets are a search vocabulary. They do not count the local radius.
  const visibilityFilter = useNearbyCatalogFilter();
  const showCounts = draftTagMatch === "any" && visibilityFilter === undefined;
  // Counts stay scoped to the search, so a term whose matches carry no tags zeroes every chip.
  const searchTerm = filter.filter?.term ?? "";
  const hasSelectableFacet = facets.some(
    (facet) => facet.count > 0 || draftTags.includes(facet.tag),
  );
  const selectedVoucherKeys = useMemo(
    () => new Set(draftVouchers.map(serializeVoucherRef)),
    [draftVouchers],
  );
  const voucherFilterEnabled = voucherSearch !== undefined;
  // Selections stay bare VoucherRefs so a chip survives a query being cleared. Labels resolve
  // against this session's picks first, then the applied filter's facets, then the address.
  const voucherFacetByKey = useMemo(
    () => new Map((voucherFacets ?? []).map((facet) => [serializeVoucherRef(facet), facet])),
    [voucherFacets],
  );

  const voucherLabel = (voucher: VoucherRef) => {
    const key = serializeVoucherRef(voucher);
    return (
      pickedVoucherNames.get(key) ??
      voucherFacetByKey.get(key)?.name ??
      formatVoucherAddress(voucher.address)
    );
  };

  const openSheet = () => {
    setDraftTags(filter.tags);
    setDraftTagMatch(filter.tagMatch);
    setDraftVouchers([...filter.vouchers]);
    setDraftVoucherMatch(filter.voucherMatch);
    voucherSearch?.setQuery("");
    onOpenChange(true);
  };

  const toggleDraftTag = (tag: string) => {
    const next = draftTags.includes(tag)
      ? draftTags.filter((entry) => entry !== tag)
      : [...draftTags, tag];
    setDraftTags(next);
    if (next.length < 2) setDraftTagMatch("any");
  };

  const changeOpen = (next: boolean) => {
    if (!next) voucherSearch?.setQuery("");
    onOpenChange(next);
  };

  return (
    <>
      <Button
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={trigger === "bar" ? t`Filters` : undefined}
        title={trigger === "bar" ? t`Filters` : undefined}
        variant={trigger === "bar" ? "ghost" : "default"}
        size={trigger === "bar" ? "icon-lg" : "default"}
        tap={trigger === "default"}
        className={trigger === "bar" ? "relative border-0 text-foreground" : undefined}
      >
        <RiFilter3Line className={trigger === "bar" ? "size-5" : "size-4"} aria-hidden="true" />
        {trigger === "default" ? <Trans>Filters</Trans> : null}
        {appliedCount > 0 ? (
          <Badge
            aria-hidden="true"
            size="sm"
            className={
              trigger === "bar"
                ? "absolute end-1 top-1 h-4 min-w-4 justify-center border-primary bg-primary px-0.5 text-primary-foreground tabular-nums"
                : "min-w-5 justify-center border-primary-foreground/30 bg-primary-foreground/15 text-current tabular-nums"
            }
          >
            {appliedCount}
          </Badge>
        ) : null}
      </Button>

      <SheetRoot open={open} onOpenChange={changeOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent>
            {showHeader ? (
              <SheetHeader className="flex-row items-center justify-between gap-3 px-4 pt-4 pb-3">
                <SheetTitle>{title}</SheetTitle>
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label={t`Close filters`}
                  onClick={() => changeOpen(false)}
                >
                  <RiCloseLine className="size-5" aria-hidden="true" />
                </Button>
              </SheetHeader>
            ) : (
              <SheetTitle className="sr-only">{title}</SheetTitle>
            )}

            <div
              className={`min-h-0 flex-1 overflow-y-auto border-border px-4 py-4 ${showHeader ? "border-y" : "border-b"}`}
            >
              {children}

              {voucherFilterEnabled ? (
                <section
                  className={children ? "mt-4 border-t border-border pt-4" : undefined}
                  aria-labelledby={voucherHeadingId}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <SectionHeading id={voucherHeadingId} variant="group" as="h3">
                      <Trans>Vouchers</Trans>
                    </SectionHeading>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      <Trans>
                        {draftVouchers.length} of {CATALOG_MAX_VOUCHERS}
                      </Trans>
                    </span>
                  </div>

                  <Combobox<VoucherRef, true>
                    multiple
                    inline
                    open
                    items={voucherSearch.results}
                    // The server already narrowed and capped the page; re-filtering here would
                    // only drop rows whose match lives in a field the client cannot see.
                    filter={null}
                    itemToStringLabel={voucherLabel}
                    isItemEqualToValue={(item, value) =>
                      serializeVoucherRef(item) === serializeVoucherRef(value)
                    }
                    value={draftVouchers}
                    onValueChange={(next) => {
                      setDraftVouchers(next);
                      if (next.length < 2) setDraftVoucherMatch("any");
                      rememberVoucherNames(next, voucherSearch.results, setPickedVoucherNames);
                      // Clearing the query collapses the list, so the next search starts from the
                      // hint rather than from stale results for a voucher already chosen.
                      voucherSearch.setQuery("");
                    }}
                    inputValue={voucherSearch.query}
                    onInputValueChange={voucherSearch.setQuery}
                  >
                    {/*
                     * The chips must be direct children so Base UI can register them in selection
                     * order, and the input must live inside the same container or its
                     * arrow/Backspace chip navigation is inert. `w-full` wraps the input onto its
                     * own row so 10 selections never squeeze it into an unusable sliver.
                     */}
                    <ComboboxChips className="mt-3" aria-label={t`Selected vouchers`}>
                      {draftVouchers.map((voucher) => (
                        <ComboboxChip
                          key={serializeVoucherRef(voucher)}
                          removeLabel={t`Remove ${voucherLabel(voucher)}`}
                        >
                          {voucherLabel(voucher)}
                        </ComboboxChip>
                      ))}
                      <div className="relative w-full">
                        <RiSearchLine
                          className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <ComboboxInput
                          placeholder={t`Search vouchers`}
                          aria-label={t`Search voucher filters`}
                          className="ps-9"
                        />
                      </div>
                    </ComboboxChips>

                    {atVoucherLimit ? (
                      <p className="mt-2 text-muted-foreground text-xs">
                        <Trans>
                          Limit of {CATALOG_MAX_VOUCHERS} vouchers reached. Remove one to add
                          another.
                        </Trans>
                      </p>
                    ) : voucherSearch.status === "idle" ? (
                      <p className="mt-2 text-muted-foreground text-xs">
                        <Trans>
                          Type at least {VOUCHER_SEARCH_MIN_CHARS} characters to search vouchers.
                        </Trans>
                      </p>
                    ) : voucherSearch.status === "searching" ? (
                      <p className="mt-2 text-muted-foreground text-xs" role="status">
                        <Trans>Searching vouchers…</Trans>
                      </p>
                    ) : voucherSearch.status === "error" ? (
                      <div className="mt-3 space-y-3" role="alert">
                        <p className="text-muted-foreground text-sm">
                          <Trans>Couldn't search vouchers.</Trans>
                        </p>
                        <Button
                          variant="outline"
                          tap
                          pending={voucherSearch.retrying}
                          onClick={voucherSearch.retry}
                        >
                          <Trans>Try again</Trans>
                        </Button>
                      </div>
                    ) : null}

                    {/*
                     * Base UI keeps Empty mounted as a live region, so its children — not the
                     * element — carry the conditional. Only speak up once a search has actually
                     * run, otherwise it announces "no vouchers" over an untouched input.
                     */}
                    <ComboboxEmpty>
                      {voucherSearch.status === "ready" ? (
                        <p className="mt-3 text-muted-foreground text-sm">
                          <Trans>No vouchers match this search.</Trans>
                        </p>
                      ) : null}
                    </ComboboxEmpty>

                    {/*
                     * Unmounted rather than merely hidden when there is nothing to show: an empty
                     * listbox still lands in the accessibility tree, which is exactly the "nothing
                     * at rest" this section is built to avoid.
                     */}
                    {voucherSearch.results.length > 0 ? (
                      <ComboboxList className="mt-3" aria-label={t`Voucher search results`}>
                        {(voucher: MarketVoucher) => {
                          const key = serializeVoucherRef(voucher);
                          return (
                            <ComboboxItem
                              key={key}
                              value={voucher}
                              disabled={!selectedVoucherKeys.has(key) && atVoucherLimit}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-sm">
                                  {voucher.name}
                                </span>
                                {voucher.symbol ? (
                                  <span className="block truncate font-mono text-muted-foreground text-xs">
                                    {voucher.symbol}
                                  </span>
                                ) : null}
                              </span>
                              <ComboboxItemIndicator />
                            </ComboboxItem>
                          );
                        }}
                      </ComboboxList>
                    ) : null}
                  </Combobox>

                  {draftVouchers.length > 1 ? (
                    <section
                      className="mt-6 border-t border-border pt-4"
                      aria-labelledby={voucherMatchHeadingId}
                    >
                      <SectionHeading id={voucherMatchHeadingId} variant="group" as="h3">
                        <Trans>How should vouchers match?</Trans>
                      </SectionHeading>
                      <div
                        className="mt-3 grid grid-cols-2 gap-2"
                        role="group"
                        aria-label={t`Voucher match`}
                      >
                        <TagMatchToggle
                          pressed={draftVoucherMatch === "any"}
                          onPressed={() => setDraftVoucherMatch("any")}
                          label={t`Any selected`}
                        />
                        <TagMatchToggle
                          pressed={draftVoucherMatch === "all"}
                          onPressed={() => setDraftVoucherMatch("all")}
                          label={t`All selected`}
                        />
                      </div>
                    </section>
                  ) : null}
                </section>
              ) : null}

              <section
                className={
                  children || voucherFilterEnabled ? "mt-4 border-t border-border pt-4" : undefined
                }
                aria-labelledby={categoryHeadingId}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <SectionHeading id={categoryHeadingId} variant="group" as="h3">
                    {facetTitle}
                  </SectionHeading>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    <Trans>
                      {draftTags.length} of {CATALOG_MAX_TAGS}
                    </Trans>
                  </span>
                </div>

                {facets.length === 0 ? (
                  <p className="mt-3 text-muted-foreground text-sm">
                    <Trans>No category filters are available.</Trans>
                  </p>
                ) : hasSelectableFacet ? (
                  <div
                    className="mt-3 flex flex-wrap gap-2"
                    role="group"
                    aria-label={t`Filter by tag`}
                  >
                    {facets.map((facet) => {
                      const selected = draftTags.includes(facet.tag);
                      return (
                        <SelectableTagBadge
                          key={facet.tag}
                          tag={facet.tag}
                          selected={selected}
                          count={showCounts ? facet.count : undefined}
                          disabled={!selected && (facet.count === 0 || atTagLimit)}
                          onClick={() => toggleDraftTag(facet.tag)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-muted-foreground text-sm">
                      {searchTerm !== "" ? (
                        <Trans>Nothing matching “{searchTerm}” carries a category.</Trans>
                      ) : (
                        <Trans>No categories are available for the current results.</Trans>
                      )}
                    </p>
                    {searchTerm !== "" ? (
                      <Button variant="outline" tap onClick={filter.clearTerm}>
                        <Trans>Clear search</Trans>
                      </Button>
                    ) : null}
                  </div>
                )}
              </section>

              {draftTags.length > 1 ? (
                <section
                  className="mt-6 border-t border-border pt-4"
                  aria-labelledby={matchHeadingId}
                >
                  <SectionHeading id={matchHeadingId} variant="group" as="h3">
                    <Trans>How should categories match?</Trans>
                  </SectionHeading>
                  <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={t`Match`}>
                    <TagMatchToggle
                      pressed={draftTagMatch === "any"}
                      onPressed={() => setDraftTagMatch("any")}
                      label={t`Any selected`}
                    />
                    <TagMatchToggle
                      pressed={draftTagMatch === "all"}
                      onPressed={() => setDraftTagMatch("all")}
                      label={t`All selected`}
                    />
                  </div>
                </section>
              ) : null}
            </div>

            {/* Stacked like every other sheet footer: beside Reset, "Apply
                filters" outgrows a 360px row in Dutch. Both stand as tall as
                the Wallet's create buttons. */}
            <SheetFooter className="bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                tap
                className="w-full"
                onClick={() => {
                  onApply(draftTags, draftTagMatch, draftVouchers, draftVoucherMatch);
                  onOpenChange(false);
                }}
              >
                <RiCheckLine className="size-4" aria-hidden="true" />
                <Trans>Apply filters</Trans>
              </Button>
              <Button
                variant="outline"
                tap
                className="w-full border-primary! text-primary hover:bg-primary/10 hover:text-primary"
                disabled={
                  draftTags.length === 0 && draftVouchers.length === 0 && additionalDraftCount === 0
                }
                onClick={() => {
                  setDraftTags([]);
                  setDraftTagMatch("any");
                  setDraftVouchers([]);
                  setDraftVoucherMatch("any");
                  onResetAdditional?.();
                }}
              >
                <Trans>Reset</Trans>
              </Button>
            </SheetFooter>
            {!showHeader ? (
              <SheetClose className="sr-only">
                <Trans>Close filters</Trans>
              </SheetClose>
            ) : null}
          </SheetContent>
        </SheetPortal>
      </SheetRoot>
    </>
  );
}

function TagMatchToggle({
  pressed,
  onPressed,
  label,
}: {
  pressed: boolean;
  onPressed: () => void;
  label: string;
}) {
  return (
    <Toggle
      variant="outline"
      pressed={pressed}
      onPressedChange={(nextPressed) => {
        if (nextPressed) onPressed();
      }}
      className="data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
    >
      {pressed ? <RiCheckLine className="size-4" aria-hidden="true" /> : null}
      {label}
    </Toggle>
  );
}
