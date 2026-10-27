import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";

const mocks = vi.hoisted(() => ({
  current: null as CatalogFilterControls | null,
  setTags: vi.fn(),
  setFacets: vi.fn(),
  setResourceFacets: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("#/lib/navigation/use-catalog-filter", () => ({
  useCatalogFilter: () => {
    if (!mocks.current) throw new Error("filter controls not initialized");
    return mocks.current;
  },
}));

import {
  MARKET_FILTER_PREFERENCES_NAME,
  useMarketFilter,
} from "#/features/home/hooks/use-market-filter";
import { ownerScopedKey } from "#/lib/storage/owner-tier-key";

const OWNER = "0xabc0000000000000000000000000000000000123";
const MARKET_FILTER_PREFERENCES_KEY = ownerScopedKey(OWNER, MARKET_FILTER_PREFERENCES_NAME);

function controls(filter: CatalogFilter | null): CatalogFilterControls {
  const effective = filter ?? {
    term: "",
    tags: [],
    tagMatch: "any",
    vouchers: [],
    voucherMatch: "any",
    pools: [],
    poolMatch: "any",
  };
  return {
    term: effective.term,
    setTerm: vi.fn(),
    isDebouncing: false,
    result: { ok: true, filter: effective },
    filter,
    isFiltered: filter !== null,
    tags: effective.tags,
    tagMatch: effective.tagMatch,
    vouchers: effective.vouchers,
    voucherMatch: effective.voucherMatch,
    pools: effective.pools ?? [],
    poolMatch: effective.poolMatch ?? "any",
    toggleTag: vi.fn(),
    setTags: mocks.setTags,
    setTagMatch: vi.fn(),
    setFacets: mocks.setFacets,
    setResourceFacets: mocks.setResourceFacets,
    isAtTagLimit: false,
    clearTerm: vi.fn(),
    clear: mocks.clear,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.setTags.mockReset();
  mocks.setFacets.mockReset();
  mocks.setResourceFacets.mockReset();
  mocks.clear.mockReset();
  mocks.current = controls(null);
});

describe("useMarketFilter preferences", () => {
  it("restores saved facets into an otherwise unfiltered URL without adding history", () => {
    window.localStorage.setItem(
      MARKET_FILTER_PREFERENCES_KEY,
      JSON.stringify({ tags: ["Culture", "Art"], tagMatch: "all" }),
    );

    const { result, rerender } = renderHook(() => useMarketFilter(OWNER));

    expect(mocks.setResourceFacets).toHaveBeenCalledWith(
      ["Art", "Culture"],
      "all",
      [],
      "any",
      [],
      "any",
      { replace: true },
    );
    expect(result.current.isRestoringPreference).toBe(true);

    mocks.current = controls({
      term: "",
      tags: ["Art", "Culture"],
      tagMatch: "all",
      vouchers: [],
      voucherMatch: "any",
    });
    rerender();

    expect(result.current.isRestoringPreference).toBe(false);
  });

  it("lets an explicit URL filter win over the saved preference", () => {
    window.localStorage.setItem(
      MARKET_FILTER_PREFERENCES_KEY,
      JSON.stringify({ tags: ["Art"], tagMatch: "any" }),
    );
    mocks.current = controls({
      term: "market",
      tags: [],
      tagMatch: "any",
      vouchers: [],
      voucherMatch: "any",
    });

    const { result } = renderHook(() => useMarketFilter(OWNER));

    expect(mocks.setFacets).not.toHaveBeenCalled();
    expect(result.current.isRestoringPreference).toBe(false);
  });

  it("discards voucher-only preferences that Market cannot honor", () => {
    window.localStorage.setItem(
      MARKET_FILTER_PREFERENCES_KEY,
      JSON.stringify({
        tags: [],
        tagMatch: "any",
        vouchers: ["42220:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        voucherMatch: "any",
      }),
    );

    const { result } = renderHook(() => useMarketFilter(OWNER));

    expect(mocks.setFacets).not.toHaveBeenCalled();
    expect(result.current.isRestoringPreference).toBe(false);
    expect(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY)).toBeNull();
  });

  it("restores supported tags and removes unsupported vouchers from a mixed preference", () => {
    window.localStorage.setItem(
      MARKET_FILTER_PREFERENCES_KEY,
      JSON.stringify({
        tags: ["Art"],
        tagMatch: "any",
        vouchers: ["42220:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
        voucherMatch: "any",
      }),
    );

    renderHook(() => useMarketFilter(OWNER));

    expect(mocks.setResourceFacets).toHaveBeenCalledWith(["Art"], "any", [], "any", [], "any", {
      replace: true,
    });
    expect(
      JSON.parse(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY) ?? "null"),
    ).toEqual({
      tags: ["Art"],
      tagMatch: "any",
      vouchers: [],
      voucherMatch: "any",
      pools: [],
      poolMatch: "any",
    });
  });

  it("saves an applied draft and clears storage with the visible clear action", () => {
    const { result } = renderHook(() => useMarketFilter(OWNER));

    act(() => result.current.applyFacetFilters(["Culture", "Art"], "all", [], "any"));

    expect(mocks.setFacets).toHaveBeenCalledWith(["Culture", "Art"], "all", [], "any");
    expect(
      JSON.parse(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY) ?? "null"),
    ).toEqual({
      tags: ["Art", "Culture"],
      tagMatch: "all",
      vouchers: [],
      voucherMatch: "any",
      pools: [],
      poolMatch: "any",
    });

    act(() => result.current.clear());

    expect(window.localStorage.getItem(MARKET_FILTER_PREFERENCES_KEY)).toBeNull();
    expect(mocks.clear).toHaveBeenCalledTimes(1);
  });
});
