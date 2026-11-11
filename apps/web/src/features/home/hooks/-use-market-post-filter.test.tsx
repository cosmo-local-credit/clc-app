import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CATALOG_FILTER_PREFERENCE_NAMES,
  readCatalogFilterPreference,
  writeCatalogFilterPreference,
} from "#/lib/navigation/catalog-filter-preference-storage";
import { MARKET_FILTER_PREFERENCES_NAME } from "./use-market-filter";

const VOUCHER: VoucherRef = {
  chainId: 100,
  address: "0x1111111111111111111111111111111111111111",
};
const POOL: VoucherRef = {
  chainId: 100,
  address: "0x2222222222222222222222222222222222222222",
};

const mocks = vi.hoisted(() => ({
  filter: {
    isFiltered: false,
    isDebouncing: false,
    tags: [] as string[],
    tagMatch: "any" as const,
    vouchers: [] as VoucherRef[],
    voucherMatch: "any" as const,
    pools: [] as VoucherRef[],
    poolMatch: "any" as const,
    setResourceFacets: vi.fn(),
    setFacets: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("#/lib/navigation/use-catalog-filter", () => ({
  useCatalogFilter: () => mocks.filter,
}));

import { useMarketPostFilter } from "./use-market-post-filter";

beforeEach(() => {
  window.localStorage.clear();
  mocks.filter.isFiltered = false;
  mocks.filter.isDebouncing = false;
  mocks.filter.tags = [];
  mocks.filter.vouchers = [];
  mocks.filter.pools = [];
  mocks.filter.setResourceFacets.mockReset();
  mocks.filter.clear.mockReset();
});

describe("useMarketPostFilter", () => {
  it("restores Marketplace categories and Post relationships as one URL update", async () => {
    writeCatalogFilterPreference(
      "guest",
      MARKET_FILTER_PREFERENCES_NAME,
      ["Food"],
      "any",
      [],
      "any",
    );
    writeCatalogFilterPreference(
      "guest",
      CATALOG_FILTER_PREFERENCE_NAMES.posts,
      ["Culture"],
      "any",
      [VOUCHER],
      "any",
      [POOL],
      "any",
    );

    const hook = renderHook(() => useMarketPostFilter("guest"));
    await waitFor(() => expect(mocks.filter.setResourceFacets).toHaveBeenCalledOnce());
    expect(mocks.filter.setResourceFacets).toHaveBeenCalledWith(
      ["Food"],
      "any",
      [VOUCHER],
      "any",
      [POOL],
      "any",
      { replace: true },
    );
    expect(hook.result.current.isRestoringPreference).toBe(true);

    mocks.filter.tags = ["Food"];
    mocks.filter.vouchers = [VOUCHER];
    mocks.filter.pools = [POOL];
    hook.rerender();
    await waitFor(() => expect(hook.result.current.isRestoringPreference).toBe(false));
  });

  it("stores generic categories separately from Post Voucher and Pool filters", () => {
    writeCatalogFilterPreference(
      "guest",
      CATALOG_FILTER_PREFERENCE_NAMES.posts,
      ["Culture"],
      "all",
      [],
      "any",
    );
    const { result } = renderHook(() => useMarketPostFilter("guest"));

    act(() =>
      result.current.applyResourceFilters(["Food"], "all", [VOUCHER], "any", [POOL], "all"),
    );

    expect(readCatalogFilterPreference("guest", MARKET_FILTER_PREFERENCES_NAME)).toMatchObject({
      tags: ["Food"],
      vouchers: [],
      pools: [],
    });
    expect(
      readCatalogFilterPreference("guest", CATALOG_FILTER_PREFERENCE_NAMES.posts),
    ).toMatchObject({
      tags: ["Culture"],
      vouchers: [VOUCHER],
      pools: [POOL],
      poolMatch: "any",
    });
    expect(mocks.filter.setResourceFacets).toHaveBeenCalledWith(
      ["Food"],
      "all",
      [VOUCHER],
      "any",
      [POOL],
      "all",
    );
  });

  it("checks Post preferences again when the storage owner changes", async () => {
    writeCatalogFilterPreference(
      "account:0xdef",
      CATALOG_FILTER_PREFERENCE_NAMES.posts,
      [],
      "any",
      [VOUCHER],
      "any",
      [POOL],
      "all",
    );
    const hook = renderHook(({ owner }) => useMarketPostFilter(owner), {
      initialProps: { owner: "account:0xabc" as string },
    });
    expect(mocks.filter.setResourceFacets).not.toHaveBeenCalled();

    hook.rerender({ owner: "account:0xdef" });
    await waitFor(() => expect(mocks.filter.setResourceFacets).toHaveBeenCalledOnce());
    expect(mocks.filter.setResourceFacets).toHaveBeenCalledWith(
      [],
      "any",
      [VOUCHER],
      "any",
      [POOL],
      "any",
      { replace: true },
    );
  });

  it("clears Marketplace categories and Post relationships while retaining Post categories", () => {
    writeCatalogFilterPreference(
      "guest",
      MARKET_FILTER_PREFERENCES_NAME,
      ["Food"],
      "any",
      [],
      "any",
    );
    writeCatalogFilterPreference(
      "guest",
      CATALOG_FILTER_PREFERENCE_NAMES.posts,
      ["Culture"],
      "any",
      [VOUCHER],
      "any",
      [POOL],
      "any",
    );
    const { result } = renderHook(() => useMarketPostFilter("guest", true));

    act(() => result.current.clear());

    expect(readCatalogFilterPreference("guest", MARKET_FILTER_PREFERENCES_NAME)).toBeNull();
    expect(
      readCatalogFilterPreference("guest", CATALOG_FILTER_PREFERENCE_NAMES.posts),
    ).toMatchObject({ tags: ["Culture"], vouchers: [], pools: [] });
    expect(mocks.filter.clear).toHaveBeenCalledOnce();
  });
});
