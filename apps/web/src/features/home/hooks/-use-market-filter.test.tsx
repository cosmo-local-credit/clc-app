import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

const mocks = vi.hoisted(() => ({
  current: null as CatalogFilterControls | null,
  setTags: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("#/lib/navigation/use-catalog-filter", () => ({
  useCatalogFilter: () => {
    if (!mocks.current) throw new Error("filter controls not initialized");
    return mocks.current;
  },
}));

import {
  MARKET_FILTER_PREFERENCES_KEY,
  useMarketFilter,
} from "#/features/home/hooks/use-market-filter";

function controls(filter: CatalogFilter | null): CatalogFilterControls {
  const effective = filter ?? { term: "", tags: [], tagMatch: "any" };
  return {
    term: effective.term,
    setTerm: vi.fn(),
    isDebouncing: false,
    result: { ok: true, filter: effective },
    filter,
    isFiltered: filter !== null,
    tags: effective.tags,
    tagMatch: effective.tagMatch,
    toggleTag: vi.fn(),
    setTags: mocks.setTags,
    setTagMatch: vi.fn(),
    isAtTagLimit: false,
    clearTerm: vi.fn(),
    clear: mocks.clear,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.setTags.mockReset();
  mocks.clear.mockReset();
  mocks.current = controls(null);
});

describe("useMarketFilter preferences", () => {
  it("restores saved facets into an otherwise unfiltered URL without adding history", () => {
    window.localStorage.setItem(
      MARKET_FILTER_PREFERENCES_KEY,
      JSON.stringify({ tags: ["Culture", "Art"], tagMatch: "all" }),
    );

    const { result, rerender } = renderHook(() => useMarketFilter());

    expect(mocks.setTags).toHaveBeenCalledWith(["Art", "Culture"], "all", { replace: true });
    expect(result.current.isRestoringPreference).toBe(true);

    mocks.current = controls({ term: "", tags: ["Art", "Culture"], tagMatch: "all" });
    rerender();

    expect(result.current.isRestoringPreference).toBe(false);
  });

  it("lets an explicit URL filter win over the saved preference", () => {
    window.localStorage.setItem(
      MARKET_FILTER_PREFERENCES_KEY,
      JSON.stringify({ tags: ["Art"], tagMatch: "any" }),
    );
    mocks.current = controls({ term: "market", tags: [], tagMatch: "any" });

    const { result } = renderHook(() => useMarketFilter());

    expect(mocks.setTags).not.toHaveBeenCalled();
    expect(result.current.isRestoringPreference).toBe(false);
  });

  it("saves an applied draft and clears storage with the visible clear action", () => {
    const { result } = renderHook(() => useMarketFilter());

    act(() => result.current.applyFacetFilters(["Culture", "Art"], "all"));

    expect(mocks.setTags).toHaveBeenCalledWith(["Culture", "Art"], "all");
    expect(
      JSON.parse(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY) ?? "null"),
    ).toEqual({ tags: ["Art", "Culture"], tagMatch: "all" });

    act(() => result.current.clear());

    expect(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY)).toBeNull();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });
});
