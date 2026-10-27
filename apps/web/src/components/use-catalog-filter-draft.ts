import type { MarketVoucher } from "@clc/api/features/market/client";
import {
  CATALOG_MAX_TAGS,
  CATALOG_MAX_VOUCHERS,
  type TagMatch,
  type VoucherRef,
  formatVoucherAddress,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import { useMemo, useState } from "react";

import type { VoucherSearchControls } from "#/features/home/hooks/use-voucher-search";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

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
 * The draft behind a catalog filter surface: facet edits stay local until Apply,
 * producing one canonical URL navigation and one query. The phone renders it as
 * a bottom sheet, the desktop as a popover; both open through `begin`.
 */
export function useCatalogFilterDraft({
  filter,
  facets,
  voucherFacets,
  voucherSearch,
  onOpenChange,
  onApply,
  additionalAppliedCount = 0,
  additionalDraftCount = 0,
  onResetAdditional,
}: {
  filter: CatalogFilterControls;
  facets: readonly CatalogFacet[];
  /** Label source for already-applied vouchers, not list content. */
  voucherFacets?: readonly CatalogVoucherFacet[];
  /** Presence of this enables the voucher section at all. */
  voucherSearch?: VoucherSearchControls;
  onOpenChange: (next: boolean) => void;
  onApply: (
    tags: readonly string[],
    tagMatch: TagMatch,
    vouchers: readonly VoucherRef[],
    voucherMatch: TagMatch,
  ) => void;
  additionalAppliedCount?: number;
  additionalDraftCount?: number;
  onResetAdditional?: () => void;
}) {
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
  const showCounts = draftTagMatch === "any";
  // Counts stay scoped to the search, so a term whose matches carry no tags zeroes every chip.
  const searchTerm = filter.filter?.term ?? "";
  const hasSelectableFacet = facets.some(
    (facet) => facet.count > 0 || draftTags.includes(facet.tag),
  );
  const selectedVoucherKeys = useMemo(
    () => new Set(draftVouchers.map(serializeVoucherRef)),
    [draftVouchers],
  );
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

  /** Copies the applied filter into the draft, then opens. */
  const begin = () => {
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

  const changeVouchers = (next: VoucherRef[]) => {
    setDraftVouchers(next);
    if (next.length < 2) setDraftVoucherMatch("any");
    if (voucherSearch) {
      rememberVoucherNames(next, voucherSearch.results, setPickedVoucherNames);
      // Clearing the query collapses the list, so the next search starts from the
      // hint rather than from stale results for a voucher already chosen.
      voucherSearch.setQuery("");
    }
  };

  const apply = () => {
    onApply(draftTags, draftTagMatch, draftVouchers, draftVoucherMatch);
    onOpenChange(false);
  };

  const reset = () => {
    setDraftTags([]);
    setDraftTagMatch("any");
    setDraftVouchers([]);
    setDraftVoucherMatch("any");
    onResetAdditional?.();
  };

  return {
    draftTags,
    draftTagMatch,
    setDraftTagMatch,
    draftVouchers,
    draftVoucherMatch,
    setDraftVoucherMatch,
    appliedCount,
    atTagLimit,
    atVoucherLimit,
    showCounts,
    searchTerm,
    hasSelectableFacet,
    selectedVoucherKeys,
    voucherLabel,
    begin,
    toggleDraftTag,
    changeOpen,
    changeVouchers,
    apply,
    reset,
    canReset: draftTags.length > 0 || draftVouchers.length > 0 || additionalDraftCount > 0,
  };
}
