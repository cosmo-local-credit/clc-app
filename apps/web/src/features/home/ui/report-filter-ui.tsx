import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

import { CatalogFilterSheet } from "#/components/catalog-filter-controls";
import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
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
import { Toggle } from "#/components/ui/toggle";
import { useVoucherSearch } from "#/features/home/hooks/use-voucher-search";
import { usePoolSearch, POOL_SEARCH_MIN_CHARS } from "#/features/catalogs/hooks/use-pool-search";
import type {
  ReportPoolFacet,
  ReportTagFacet,
  ReportVoucherFacet,
} from "@clc/api/features/reports/client";
import {
  CATALOG_MAX_POOLS,
  type TagMatch,
  type VoucherRef,
  formatVoucherAddress,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import { useReportFilterNotice } from "#/features/home/hooks/use-report-filter-notice";
import type { PersistedCatalogFilterControls } from "#/lib/navigation/use-persisted-catalog-filter";

export function ReportFilterSheet({
  filter,
  facets,
  voucherFacets,
  poolFacets,
  open,
  onOpenChange,
}: {
  filter: PersistedCatalogFilterControls;
  facets: ReportTagFacet[];
  voucherFacets: ReportVoucherFacet[];
  poolFacets: ReportPoolFacet[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [voucherQuery, setVoucherQuery] = useState("");
  const voucherSearch = useVoucherSearch(voucherQuery, setVoucherQuery, open);
  const [poolQuery, setPoolQuery] = useState("");
  const poolSearch = usePoolSearch(poolQuery, setPoolQuery, open);
  const [draftPools, setDraftPools] = useState<VoucherRef[]>([]);
  const [draftPoolMatch, setDraftPoolMatch] = useState<TagMatch>("any");

  const changeOpen = (next: boolean) => {
    if (next) {
      setDraftPools([...filter.pools]);
      setDraftPoolMatch(filter.poolMatch);
    } else {
      setPoolQuery("");
    }
    onOpenChange(next);
  };

  return (
    <CatalogFilterSheet
      filter={filter}
      facets={facets}
      title={<Trans>Filter posts</Trans>}
      facetTitle={<Trans>Categories</Trans>}
      voucherFacets={voucherFacets}
      voucherSearch={voucherSearch}
      additionalAppliedCount={filter.pools.length}
      additionalDraftCount={draftPools.length}
      onResetAdditional={() => {
        setDraftPools([]);
        setDraftPoolMatch("any");
      }}
      showHeader={false}
      open={open}
      onOpenChange={changeOpen}
      onApply={(tags, tagMatch, vouchers, voucherMatch) =>
        filter.applyResourceFilters(
          tags,
          tagMatch,
          vouchers,
          voucherMatch,
          draftPools,
          draftPoolMatch,
        )
      }
      trigger="bar"
    >
      <ReportPoolFilter
        pools={draftPools}
        match={draftPoolMatch}
        facets={poolFacets}
        search={poolSearch}
        onPoolsChange={setDraftPools}
        onMatchChange={setDraftPoolMatch}
      />
    </CatalogFilterSheet>
  );
}

function ReportPoolFilter({
  pools,
  match,
  facets,
  search,
  onPoolsChange,
  onMatchChange,
}: {
  pools: VoucherRef[];
  match: TagMatch;
  facets: ReportPoolFacet[];
  search: ReturnType<typeof usePoolSearch>;
  onPoolsChange: (next: VoucherRef[]) => void;
  onMatchChange: (next: TagMatch) => void;
}) {
  const { t } = useLingui();
  const atLimit = pools.length >= CATALOG_MAX_POOLS;
  const [pickedNames, setPickedNames] = useState<ReadonlyMap<string, string>>(new Map());
  const selectedKeys = useMemo(() => new Set(pools.map(serializeVoucherRef)), [pools]);
  const facetByKey = useMemo(
    () => new Map(facets.map((facet) => [serializeVoucherRef(facet), facet])),
    [facets],
  );
  const label = (pool: VoucherRef) =>
    pickedNames.get(serializeVoucherRef(pool)) ??
    facetByKey.get(serializeVoucherRef(pool))?.name ??
    formatVoucherAddress(pool.address);
  const results = search.results
    .filter((pool) => pool.chainId !== null)
    .map((pool) => ({
      ref: { chainId: pool.chainId as number, address: pool.address } satisfies VoucherRef,
      name: pool.name,
      symbol: pool.symbol,
    }));
  const items = [
    ...pools,
    ...results
      .map((result) => result.ref)
      .filter((pool) => !selectedKeys.has(serializeVoucherRef(pool))),
  ];

  return (
    <section aria-labelledby="post-pool-filter-heading">
      <div className="flex items-baseline justify-between gap-3">
        <SectionHeading id="post-pool-filter-heading" variant="group" as="h3">
          <Trans>Pools</Trans>
        </SectionHeading>
        <span className="font-mono text-muted-foreground text-xs tabular-nums">
          <Trans>
            {pools.length} of {CATALOG_MAX_POOLS}
          </Trans>
        </span>
      </div>
      <Combobox<VoucherRef, true>
        multiple
        inline
        open
        filter={null}
        items={items}
        value={pools}
        itemToStringLabel={label}
        isItemEqualToValue={(item, value) =>
          serializeVoucherRef(item) === serializeVoucherRef(value)
        }
        inputValue={search.query}
        onInputValueChange={search.setQuery}
        onValueChange={(next) => {
          setPickedNames((previous) => {
            const names = new Map(previous);
            for (const pool of next) {
              const key = serializeVoucherRef(pool);
              const result = results.find((entry) => serializeVoucherRef(entry.ref) === key);
              if (result) names.set(key, result.name);
            }
            return names;
          });
          onPoolsChange(next.slice(0, CATALOG_MAX_POOLS));
          if (next.length < 2) onMatchChange("any");
          search.setQuery("");
        }}
      >
        <ComboboxChips className="mt-3" aria-label={t`Selected pools`}>
          {pools.map((pool) => (
            <ComboboxChip key={serializeVoucherRef(pool)} removeLabel={t`Remove ${label(pool)}`}>
              {label(pool)}
            </ComboboxChip>
          ))}
          <ComboboxInput placeholder={t`Search pools`} aria-label={t`Search pool filters`} />
        </ComboboxChips>
        {atLimit ? (
          <p className="mt-2 text-muted-foreground text-xs">
            <Trans>Limit of {CATALOG_MAX_POOLS} pools reached. Remove one to add another.</Trans>
          </p>
        ) : search.status === "idle" ? (
          <p className="mt-2 text-muted-foreground text-xs">
            <Trans>Type at least {POOL_SEARCH_MIN_CHARS} characters to search pools.</Trans>
          </p>
        ) : search.status === "searching" ? (
          <p className="mt-2 text-muted-foreground text-xs">
            <Trans>Searching pools…</Trans>
          </p>
        ) : search.status === "error" ? (
          <Button
            variant="outline"
            tap
            pending={search.retrying}
            onClick={search.retry}
            className="mt-2"
          >
            <Trans>Try again</Trans>
          </Button>
        ) : null}
        <ComboboxEmpty>
          {search.status === "ready" ? (
            <p className="mt-3 text-muted-foreground text-sm">
              <Trans>No pools match this search.</Trans>
            </p>
          ) : null}
        </ComboboxEmpty>
        {results.length > 0 ? (
          <ComboboxList className="mt-3" aria-label={t`Pool search results`}>
            {(pool: VoucherRef) => {
              const result = results.find(
                (entry) => serializeVoucherRef(entry.ref) === serializeVoucherRef(pool),
              );
              return (
                <ComboboxItem
                  key={serializeVoucherRef(pool)}
                  value={pool}
                  disabled={!selectedKeys.has(serializeVoucherRef(pool)) && atLimit}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {result?.name ?? label(pool)}
                  </span>
                  {result?.symbol ? (
                    <Badge variant="outline" size="sm" className="font-mono text-info">
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
      {pools.length > 1 ? (
        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={t`Pool match`}>
          <Toggle pressed={match === "any"} onPressedChange={() => onMatchChange("any")}>
            <Trans>Any selected</Trans>
          </Toggle>
          <Toggle pressed={match === "all"} onPressedChange={() => onMatchChange("all")}>
            <Trans>All selected</Trans>
          </Toggle>
        </div>
      ) : null}
    </section>
  );
}

export function ReportFilterFeedback({
  filter,
  error,
  onRetry,
  retrying,
}: {
  filter: PersistedCatalogFilterControls;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const notice = useReportFilterNotice({ filter, error, onRetry, retrying });

  if (!notice) return null;

  return (
    <div className="space-y-3 border border-border bg-card p-4" role="alert">
      <p className="text-muted-foreground text-sm">{notice.message}</p>
      {notice.actionLabel && notice.onAction ? (
        <Button variant="outline" tap pending={notice.actionPending} onClick={notice.onAction}>
          {notice.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
