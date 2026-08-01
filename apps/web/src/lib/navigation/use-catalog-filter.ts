import type {
  CatalogFilter,
  CatalogFilterResult,
  TagMatch,
} from "@clc/core/features/catalog/logic";
import {
  CATALOG_MAX_TAGS,
  isFilterActive,
  parseCatalogFilter,
  toCatalogSearchState,
} from "@clc/core/features/catalog/logic";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { CLEARED_CATALOG_SEARCH, pickCatalogSearch } from "#/lib/navigation/catalog-search";

const CATALOG_FILTER_DEBOUNCE_MS = 250;

function useDebouncedValue<T>(value: T, delayMs = CATALOG_FILTER_DEBOUNCE_MS) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return { settled, isPending: settled !== value };
}

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
  isAtTagLimit: boolean;
  clearTerm: () => void;
  clear: () => void;
};

export function useCatalogFilter(): CatalogFilterControls {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();

  const searchState = pickCatalogSearch(search);
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
    isAtTagLimit: tags.length >= CATALOG_MAX_TAGS,
    clearTerm,
    clear,
  };
}
