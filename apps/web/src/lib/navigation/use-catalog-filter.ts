import type {
  CatalogFilter,
  CatalogFilterResult,
  TagMatch,
  VoucherRef,
} from "@clc/core/features/catalog/logic";
import {
  CATALOG_MAX_TAGS,
  isFilterActive,
  parseCatalogFilter,
  serializeVoucherRef,
  toCatalogSearchState,
} from "@clc/core/features/catalog/logic";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { catalogSearchForScope, CLEARED_CATALOG_SEARCH } from "#/lib/navigation/catalog-search";
import { useDebouncedValue } from "#/lib/use-debounced-value";

export type CatalogFilterControls = {
  term: string;
  setTerm: (next: string) => void;
  isDebouncing: boolean;
  result: CatalogFilterResult;
  filter: CatalogFilter | null;
  isFiltered: boolean;
  tags: readonly string[];
  tagMatch: TagMatch;
  toggleTag: (tag: string) => void;
  setTags: (
    nextTags: readonly string[],
    nextTagMatch: TagMatch,
    options?: { replace?: boolean },
  ) => void;
  setTagMatch: (next: TagMatch) => void;
  vouchers: readonly VoucherRef[];
  voucherMatch: TagMatch;
  pools: readonly VoucherRef[];
  poolMatch: TagMatch;
  setFacets: (
    tags: readonly string[],
    tagMatch: TagMatch,
    vouchers: readonly VoucherRef[],
    voucherMatch: TagMatch,
    options?: { replace?: boolean },
  ) => void;
  setResourceFacets: (
    tags: readonly string[],
    tagMatch: TagMatch,
    vouchers: readonly VoucherRef[],
    voucherMatch: TagMatch,
    pools: readonly VoucherRef[],
    poolMatch: TagMatch,
    options?: { replace?: boolean },
  ) => void;
  isAtTagLimit: boolean;
  clearTerm: () => void;
  clear: () => void;
};

export function useCatalogFilter(options?: {
  voucherRelationships?: boolean;
  poolRelationships?: boolean;
}): CatalogFilterControls {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();

  const searchState = catalogSearchForScope(
    search,
    options?.voucherRelationships === true,
    options?.poolRelationships === true,
  );
  const urlTerm = typeof searchState.q === "string" ? searchState.q : "";

  const [term, setTerm] = useState(urlTerm);
  const { settled, isPending: isDebouncing } = useDebouncedValue(term);

  const result = parseCatalogFilter({ ...searchState, q: settled });
  const isFiltered = !result.ok || isFilterActive(result.filter);
  const filter = result.ok && isFilterActive(result.filter) ? result.filter : null;

  const syncedTerm = useRef(urlTerm);

  useEffect(() => {
    const settledCanonical = parseCatalogFilter({ q: settled });
    if (!settledCanonical.ok) return;
    const canonicalTerm = toCatalogSearchState(settledCanonical.filter).q ?? "";

    if (canonicalTerm === syncedTerm.current) return;

    syncedTerm.current = canonicalTerm;
    void navigate({
      to: ".",
      replace: true,
      search: (previous) => ({ ...previous, q: canonicalTerm === "" ? undefined : canonicalTerm }),
    });
  }, [settled, navigate]);

  useEffect(() => {
    if (urlTerm === syncedTerm.current) return;
    syncedTerm.current = urlTerm;
    setTerm(urlTerm);
  }, [urlTerm]);

  const clearTerm = useCallback(() => {
    syncedTerm.current = "";
    setTerm("");
    void navigate({
      to: ".",
      replace: true,
      search: (previous) => ({ ...previous, q: undefined }),
    });
  }, [navigate]);

  const clear = useCallback(() => {
    syncedTerm.current = "";
    setTerm("");
    void navigate({
      to: ".",
      replace: true,
      search: (previous) => ({ ...previous, ...CLEARED_CATALOG_SEARCH }),
    });
  }, [navigate]);

  const tags = result.ok ? result.filter.tags : [];
  const tagMatch = result.ok ? result.filter.tagMatch : "any";
  const vouchers = result.ok ? result.filter.vouchers : [];
  const voucherMatch = result.ok ? result.filter.voucherMatch : "any";
  const pools = result.ok ? (result.filter.pools ?? []) : [];
  const poolMatch = result.ok ? (result.filter.poolMatch ?? "any") : "any";

  const setResourceFacets = useCallback(
    (
      nextTags: readonly string[],
      nextTagMatch: TagMatch,
      nextVouchers: readonly VoucherRef[],
      nextVoucherMatch: TagMatch,
      nextPools: readonly VoucherRef[],
      nextPoolMatch: TagMatch,
      navigationOptions?: { replace?: boolean },
    ) => {
      const canonical = parseCatalogFilter({
        ...searchState,
        tags: nextTags,
        tagMatch: nextTagMatch,
        vouchers: nextVouchers.map(serializeVoucherRef),
        voucherMatch: nextVoucherMatch,
        pools: nextPools.map(serializeVoucherRef),
        poolMatch: nextPoolMatch,
      });
      if (!canonical.ok) return;
      void navigate({
        to: ".",
        replace: navigationOptions?.replace,
        search: (previous) => ({
          ...previous,
          ...CLEARED_CATALOG_SEARCH,
          ...toCatalogSearchState(canonical.filter),
        }),
      });
    },
    [navigate, searchState],
  );

  const setTags = useCallback(
    (nextTags: readonly string[], nextTagMatch: TagMatch, options?: { replace?: boolean }) => {
      const canonical = parseCatalogFilter({
        ...searchState,
        tags: nextTags,
        tagMatch: nextTagMatch,
      });
      if (!canonical.ok) return;

      void navigate({
        to: ".",
        replace: options?.replace,
        search: (previous) => ({
          ...previous,
          ...CLEARED_CATALOG_SEARCH,
          ...toCatalogSearchState(canonical.filter),
        }),
      });
    },
    [navigate, searchState],
  );

  const setFacets = useCallback(
    (
      nextTags: readonly string[],
      nextTagMatch: TagMatch,
      nextVouchers: readonly VoucherRef[],
      nextVoucherMatch: TagMatch,
      navigationOptions?: { replace?: boolean },
    ) => {
      const canonical = parseCatalogFilter({
        ...searchState,
        tags: nextTags,
        tagMatch: nextTagMatch,
        vouchers: nextVouchers.map(serializeVoucherRef),
        voucherMatch: nextVoucherMatch,
      });
      if (!canonical.ok) return;

      void navigate({
        to: ".",
        replace: navigationOptions?.replace,
        search: (previous) => ({
          ...previous,
          ...CLEARED_CATALOG_SEARCH,
          ...toCatalogSearchState(canonical.filter),
        }),
      });
    },
    [navigate, searchState],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      if (!result.ok) return;

      const next = tags.includes(tag) ? tags.filter((entry) => entry !== tag) : [...tags, tag];
      setTags(next, tagMatch);
    },
    [result, setTags, tagMatch, tags],
  );

  const setTagMatch = useCallback(
    (next: TagMatch) => {
      setTags(tags, next);
    },
    [setTags, tags],
  );

  return {
    term,
    setTerm,
    isDebouncing,
    result,
    filter,
    isFiltered,
    tags,
    tagMatch,
    toggleTag,
    setTags,
    setTagMatch,
    vouchers,
    voucherMatch,
    pools,
    poolMatch,
    setFacets,
    setResourceFacets,
    isAtTagLimit: tags.length >= CATALOG_MAX_TAGS,
    clearTerm,
    clear,
  };
}
