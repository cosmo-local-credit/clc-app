import type {
  ReportPoolFacet,
  ReportTagFacet,
  ReportVoucherFacet,
} from "@clc/api/features/reports/client";
import {
  CATALOG_MAX_POOLS,
  CATALOG_MAX_TAGS,
  CATALOG_MAX_VOUCHERS,
  type TagMatch,
  type VoucherRef,
  formatVoucherAddress,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useId, useMemo, useState } from "react";
import { RiSearchLine } from "react-icons/ri";

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
import { SectionHeading } from "#/components/ui/section-heading";
import { SelectableTagBadge } from "#/components/ui/tag-badge";
import { DeskSegment, DeskSegmentItem } from "#/desktop/ui/segment";
import { POOL_SEARCH_MIN_CHARS, usePoolSearch } from "#/features/catalogs/hooks/use-pool-search";
import {
  VOUCHER_SEARCH_MIN_CHARS,
  useVoucherSearch,
} from "#/features/home/hooks/use-voucher-search";
import type { PersistedCatalogFilterControls } from "#/lib/navigation/use-persisted-catalog-filter";
import { cn } from "#/lib/utils";

type Option = { ref: VoucherRef; name: string; symbol: string | null };

/**
 * The phone's "Filter posts" sheet as a standing facet column. Every change
 * writes the filter straight away, so there is no Apply. Where the page has no
 * room to dock it, the page opens it above the feed, and its groups sit three
 * across instead of stacking.
 */
export function PostFacets({
  filter,
  tagFacets,
  voucherFacets,
  poolFacets,
}: {
  filter: PersistedCatalogFilterControls;
  tagFacets: ReportTagFacet[];
  voucherFacets: ReportVoucherFacet[];
  poolFacets: ReportPoolFacet[];
}) {
  const { t } = useLingui();
  const [voucherQuery, setVoucherQuery] = useState("");
  const voucherSearch = useVoucherSearch(voucherQuery, setVoucherQuery, true);
  const [poolQuery, setPoolQuery] = useState("");
  const poolSearch = usePoolSearch(poolQuery, setPoolQuery, true);

  const apply = (
    next: Partial<{
      tags: readonly string[];
      tagMatch: TagMatch;
      vouchers: readonly VoucherRef[];
      voucherMatch: TagMatch;
      pools: readonly VoucherRef[];
      poolMatch: TagMatch;
    }>,
  ) => {
    const tags = next.tags ?? filter.tags;
    const vouchers = next.vouchers ?? filter.vouchers;
    const pools = next.pools ?? filter.pools;
    filter.applyResourceFilters(
      tags,
      tags.length < 2 ? "any" : (next.tagMatch ?? filter.tagMatch),
      vouchers,
      vouchers.length < 2 ? "any" : (next.voucherMatch ?? filter.voucherMatch),
      pools,
      pools.length < 2 ? "any" : (next.poolMatch ?? filter.poolMatch),
    );
  };

  const hasAny = filter.tags.length + filter.vouchers.length + filter.pools.length > 0;
  const showCounts = filter.tagMatch === "any";
  const atTagLimit = filter.tags.length >= CATALOG_MAX_TAGS;

  return (
    <aside
      aria-label={t`Filter posts`}
      className="grid min-w-0 content-start @max-[56rem]:grid-cols-3 @max-[56rem]:gap-x-6"
    >
      <FacetGroup
        title={<Trans>Vouchers</Trans>}
        count={
          <Trans>
            {filter.vouchers.length} of {CATALOG_MAX_VOUCHERS}
          </Trans>
        }
        className="pt-0"
      >
        <RefPicker
          selected={filter.vouchers}
          max={CATALOG_MAX_VOUCHERS}
          facets={voucherFacets}
          query={voucherSearch.query}
          setQuery={voucherSearch.setQuery}
          results={voucherSearch.results.map((voucher) => ({
            ref: { chainId: voucher.chainId, address: voucher.address },
            name: voucher.name,
            symbol: voucher.symbol,
          }))}
          status={voucherSearch.status}
          retry={voucherSearch.retry}
          retrying={voucherSearch.retrying}
          hints={{
            limit: (
              <Trans>
                Limit of {CATALOG_MAX_VOUCHERS} vouchers reached. Remove one to add another.
              </Trans>
            ),
            idle: (
              <Trans>Type at least {VOUCHER_SEARCH_MIN_CHARS} characters to search vouchers.</Trans>
            ),
            searching: <Trans>Searching vouchers…</Trans>,
            empty: <Trans>No vouchers match this search.</Trans>,
          }}
          placeholder={t`Search vouchers`}
          inputLabel={t`Search voucher filters`}
          selectedLabel={t`Selected vouchers`}
          listLabel={t`Voucher search results`}
          onChange={(vouchers) => apply({ vouchers })}
        />
        {filter.vouchers.length > 1 ? (
          <MatchSegment
            label={t`Voucher match`}
            value={filter.voucherMatch}
            onChange={(voucherMatch) => apply({ voucherMatch })}
          />
        ) : null}
      </FacetGroup>

      <FacetGroup
        title={<Trans>Categories</Trans>}
        count={
          <Trans>
            {filter.tags.length} of {CATALOG_MAX_TAGS}
          </Trans>
        }
      >
        {tagFacets.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            <Trans>No category filters are available.</Trans>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t`Filter by tag`}>
            {tagFacets.map((facet) => {
              const selected = filter.tags.includes(facet.tag);
              return (
                <SelectableTagBadge
                  key={facet.tag}
                  tag={facet.tag}
                  selected={selected}
                  count={showCounts ? facet.count : undefined}
                  disabled={!selected && (facet.count === 0 || atTagLimit)}
                  onClick={() =>
                    apply({
                      tags: selected
                        ? filter.tags.filter((tag) => tag !== facet.tag)
                        : [...filter.tags, facet.tag],
                    })
                  }
                />
              );
            })}
          </div>
        )}
        {filter.tags.length > 1 ? (
          <MatchSegment
            label={t`Match`}
            value={filter.tagMatch}
            onChange={(tagMatch) => apply({ tagMatch })}
          />
        ) : null}
      </FacetGroup>

      <FacetGroup
        title={<Trans>Pools</Trans>}
        count={
          <Trans>
            {filter.pools.length} of {CATALOG_MAX_POOLS}
          </Trans>
        }
      >
        <RefPicker
          selected={filter.pools}
          max={CATALOG_MAX_POOLS}
          facets={poolFacets}
          query={poolSearch.query}
          setQuery={poolSearch.setQuery}
          results={poolSearch.results
            .filter((pool) => pool.chainId !== null)
            .map((pool) => ({
              ref: { chainId: pool.chainId as number, address: pool.address },
              name: pool.name,
              symbol: pool.symbol,
            }))}
          status={poolSearch.status}
          retry={poolSearch.retry}
          retrying={poolSearch.retrying}
          hints={{
            limit: (
              <Trans>Limit of {CATALOG_MAX_POOLS} pools reached. Remove one to add another.</Trans>
            ),
            idle: <Trans>Type at least {POOL_SEARCH_MIN_CHARS} characters to search pools.</Trans>,
            searching: <Trans>Searching pools…</Trans>,
            empty: <Trans>No pools match this search.</Trans>,
          }}
          placeholder={t`Search pools`}
          inputLabel={t`Search pool filters`}
          selectedLabel={t`Selected pools`}
          listLabel={t`Pool search results`}
          onChange={(pools) => apply({ pools })}
        />
        {filter.pools.length > 1 ? (
          <MatchSegment
            label={t`Pool match`}
            value={filter.poolMatch}
            onChange={(poolMatch) => apply({ poolMatch })}
          />
        ) : null}
      </FacetGroup>

      <div className="pt-4 @max-[56rem]:col-span-full">
        <Button variant="outline" disabled={!hasAny} onClick={filter.clear}>
          <Trans>Reset</Trans>
        </Button>
      </div>
    </aside>
  );
}

function FacetGroup({
  title,
  count,
  children,
  className,
}: {
  title: ReactNode;
  count: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn("grid gap-2 border-border border-b py-4 @max-[56rem]:pt-0", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <SectionHeading id={headingId} variant="group" as="h2">
          {title}
        </SectionHeading>
        <span className="text-muted-foreground text-xs">{count}</span>
      </div>
      {children}
    </section>
  );
}

function MatchSegment({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TagMatch;
  onChange: (next: TagMatch) => void;
}) {
  return (
    <DeskSegment label={label} className="self-start">
      <DeskSegmentItem active={value === "any"}>
        <button type="button" onClick={() => onChange("any")}>
          <Trans>Any selected</Trans>
        </button>
      </DeskSegmentItem>
      <DeskSegmentItem active={value === "all"}>
        <button type="button" onClick={() => onChange("all")}>
          <Trans>All selected</Trans>
        </button>
      </DeskSegmentItem>
    </DeskSegment>
  );
}

/** A search-driven multi-picker for voucher or pool references. */
function RefPicker({
  selected,
  max,
  facets,
  query,
  setQuery,
  results,
  status,
  retry,
  retrying,
  hints,
  placeholder,
  inputLabel,
  selectedLabel,
  listLabel,
  onChange,
}: {
  selected: readonly VoucherRef[];
  max: number;
  facets: readonly (VoucherRef & { name: string })[];
  query: string;
  setQuery: (next: string) => void;
  results: Option[];
  status: "idle" | "searching" | "ready" | "error";
  retry: () => void;
  retrying: boolean;
  hints: { limit: ReactNode; idle: ReactNode; searching: ReactNode; empty: ReactNode };
  placeholder: string;
  inputLabel: string;
  selectedLabel: string;
  listLabel: string;
  onChange: (next: VoucherRef[]) => void;
}) {
  const { t } = useLingui();
  const [pickedNames, setPickedNames] = useState<ReadonlyMap<string, string>>(new Map());
  const selectedKeys = useMemo(() => new Set(selected.map(serializeVoucherRef)), [selected]);
  const facetByKey = useMemo(
    () => new Map(facets.map((facet) => [serializeVoucherRef(facet), facet.name])),
    [facets],
  );
  const atLimit = selected.length >= max;
  const label = (ref: VoucherRef) => {
    const key = serializeVoucherRef(ref);
    return pickedNames.get(key) ?? facetByKey.get(key) ?? formatVoucherAddress(ref.address);
  };
  const items = [
    ...selected,
    ...results
      .map((result) => result.ref)
      .filter((ref) => !selectedKeys.has(serializeVoucherRef(ref))),
  ];

  return (
    <Combobox<VoucherRef, true>
      multiple
      inline
      open
      filter={null}
      items={items}
      value={[...selected]}
      itemToStringLabel={label}
      isItemEqualToValue={(item, value) => serializeVoucherRef(item) === serializeVoucherRef(value)}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(next) => {
        setPickedNames((previous) => {
          const names = new Map(previous);
          for (const ref of next) {
            const key = serializeVoucherRef(ref);
            const result = results.find((entry) => serializeVoucherRef(entry.ref) === key);
            if (result) names.set(key, result.name);
          }
          return names;
        });
        onChange(next.slice(0, max));
        setQuery("");
      }}
    >
      <ComboboxChips aria-label={selectedLabel}>
        {selected.map((ref) => (
          <ComboboxChip key={serializeVoucherRef(ref)} removeLabel={t`Remove ${label(ref)}`}>
            {label(ref)}
          </ComboboxChip>
        ))}
        <div className="relative w-full">
          <RiSearchLine
            className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <ComboboxInput placeholder={placeholder} aria-label={inputLabel} className="ps-9" />
        </div>
      </ComboboxChips>
      {atLimit ? (
        <p className="text-muted-foreground text-xs">{hints.limit}</p>
      ) : status === "idle" && query.trim().length > 0 ? (
        <p className="text-muted-foreground text-xs">{hints.idle}</p>
      ) : status === "searching" ? (
        <p className="text-muted-foreground text-xs" role="status">
          {hints.searching}
        </p>
      ) : status === "error" ? (
        <Button variant="outline" pending={retrying} onClick={retry} className="self-start">
          <Trans>Try again</Trans>
        </Button>
      ) : null}
      <ComboboxEmpty>
        {status === "ready" ? <p className="text-muted-foreground text-xs">{hints.empty}</p> : null}
      </ComboboxEmpty>
      {results.length > 0 ? (
        <ComboboxList aria-label={listLabel}>
          {(ref: VoucherRef) => {
            const key = serializeVoucherRef(ref);
            const result = results.find((entry) => serializeVoucherRef(entry.ref) === key);
            return (
              <ComboboxItem key={key} value={ref} disabled={!selectedKeys.has(key) && atLimit}>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {result?.name ?? label(ref)}
                </span>
                {result?.symbol ? (
                  <Badge variant="outline" size="sm" className="font-mono">
                    {result.symbol}
                  </Badge>
                ) : null}
                <ComboboxItemIndicator />
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      ) : null}
    </Combobox>
  );
}
