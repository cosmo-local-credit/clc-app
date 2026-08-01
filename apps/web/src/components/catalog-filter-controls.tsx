import { CATALOG_MAX_TAGS, type TagMatch } from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState, type ReactNode } from "react";
import { RiCheckLine, RiCloseLine, RiFilter3Line, RiSearchLine } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { SelectableTagBadge } from "#/components/ui/tag-badge";
import { Toggle } from "#/components/ui/toggle";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

export function CatalogSearchField({
  filter,
  label,
}: {
  filter: CatalogFilterControls;
  label: string;
}) {
  const { t } = useLingui();

  return (
    <div className="relative">
      <RiSearchLine
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={filter.term}
        onChange={(event) => filter.setTerm(event.target.value)}
        aria-label={label}
        placeholder={label}
        className="appearance-none rounded-none bg-card pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {filter.term !== "" ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={filter.clearTerm}
          aria-label={t`Clear search`}
          className="absolute top-1/2 right-1 -translate-y-1/2 border-0 bg-transparent text-muted-foreground before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] hover:bg-transparent hover:text-foreground focus-visible:border-transparent focus-visible:bg-transparent"
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

/**
 * Shared shadcn/Base UI filter sheet for exhaustive catalogs.
 *
 * Facet edits stay local until Apply, producing one canonical URL navigation and one query.
 * Entity-specific pages supply the title, facet vocabulary, persistence action, and any
 * compact controls that belong before the facets.
 */
export function CatalogFilterSheet({
  filter,
  facets,
  title,
  facetTitle,
  onApply,
  children,
}: {
  filter: CatalogFilterControls;
  facets: readonly CatalogFacet[];
  title: ReactNode;
  facetTitle: ReactNode;
  onApply: (tags: readonly string[], tagMatch: TagMatch) => void;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const categoryHeadingId = useId();
  const matchHeadingId = useId();
  const [open, setOpen] = useState(false);
  const [draftTags, setDraftTags] = useState<readonly string[]>([]);
  const [draftTagMatch, setDraftTagMatch] = useState<TagMatch>("any");

  const appliedCount = filter.result.ok ? filter.tags.length : filter.result.requested;
  const atTagLimit = draftTags.length >= CATALOG_MAX_TAGS;
  // Disjunctive counts describe what a chip adds under Any. They ignore the selected tags,
  // so showing them under All would imply a conjunctive count the backend did not compute.
  const showCounts = draftTagMatch === "any";
  // Counts stay scoped to the search, so a term whose matches carry no tags zeroes every chip.
  const searchTerm = filter.filter?.term ?? "";
  const hasSelectableFacet = facets.some(
    (facet) => facet.count > 0 || draftTags.includes(facet.tag),
  );

  const openSheet = () => {
    setDraftTags(filter.tags);
    setDraftTagMatch(filter.tagMatch);
    setOpen(true);
  };

  const toggleDraftTag = (tag: string) => {
    const next = draftTags.includes(tag)
      ? draftTags.filter((entry) => entry !== tag)
      : [...draftTags, tag];
    setDraftTags(next);
    if (next.length < 2) setDraftTagMatch("any");
  };

  return (
    <>
      <Button
        size="lg"
        onClick={openSheet}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative h-9 px-2.5 before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']"
      >
        <RiFilter3Line className="size-4" aria-hidden="true" />
        <Trans>Filters</Trans>
        {appliedCount > 0 ? (
          <span className="min-w-4 border border-primary-foreground/30 bg-primary-foreground/15 px-1 text-[10px] tabular-nums">
            {appliedCount}
          </span>
        ) : null}
      </Button>

      <SheetRoot open={open} onOpenChange={setOpen}>
        <SheetPortal>
          <SheetBackdrop />
          <SheetContent className="rounded-none border-t border-border bg-background shadow-none">
            <SheetHeader className="flex-row items-center justify-between gap-3 px-4 pt-4 pb-3">
              <SheetTitle className="font-heading text-[1.375rem] font-semibold leading-tight">
                {title}
              </SheetTitle>
              <Button
                variant="outline"
                size="icon-lg"
                className="relative h-9 w-9 bg-card before:absolute before:-inset-1 before:content-['']"
                aria-label={t`Close filters`}
                onClick={() => setOpen(false)}
              >
                <RiCloseLine className="size-5" aria-hidden="true" />
              </Button>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto border-y border-border px-4 py-4">
              {children}

              <section
                className={children ? "mt-4 border-t border-border pt-4" : undefined}
                aria-labelledby={categoryHeadingId}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id={categoryHeadingId} className="font-heading text-sm font-semibold">
                    {facetTitle}
                  </h3>
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
                          className="relative h-9 before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']"
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 bg-card"
                        onClick={filter.clearTerm}
                      >
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
                  <h3 id={matchHeadingId} className="font-heading text-sm font-semibold">
                    <Trans>How should categories match?</Trans>
                  </h3>
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

            <SheetFooter className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                variant="outline"
                className="h-11 bg-card px-4"
                disabled={draftTags.length === 0}
                onClick={() => {
                  setDraftTags([]);
                  setDraftTagMatch("any");
                }}
              >
                <Trans>Reset</Trans>
              </Button>
              <Button
                className="h-11"
                onClick={() => {
                  onApply(draftTags, draftTagMatch);
                  setOpen(false);
                }}
              >
                <RiCheckLine className="size-4" aria-hidden="true" />
                <Trans>Apply filters</Trans>
              </Button>
            </SheetFooter>
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
      className="h-11 bg-card data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground"
    >
      {pressed ? <RiCheckLine className="size-4" aria-hidden="true" /> : null}
      {label}
    </Toggle>
  );
}
