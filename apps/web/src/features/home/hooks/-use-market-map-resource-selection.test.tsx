import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { ownerScopedKey } from "#/lib/storage/owner-tier-key";
import {
  DEFAULT_MARKET_MAP_RESOURCES,
  MARKET_MAP_RESOURCE_KINDS,
  normalizeMarketMapResources,
  useMarketMapResourceSelection,
} from "./use-market-map-resource-selection";

const STORAGE_NAME = "market-map-resources.v1";

beforeEach(() => window.localStorage.clear());

describe("normalizeMarketMapResources", () => {
  it("canonicalizes order, removes duplicates, and accepts an empty selection", () => {
    expect(normalizeMarketMapResources(["post", "voucher", "post", "pool"])).toEqual([
      "voucher",
      "pool",
      "post",
    ]);
    expect(normalizeMarketMapResources([])).toEqual([]);
  });

  it("rejects malformed stored selections", () => {
    expect(normalizeMarketMapResources("voucher")).toBeNull();
    expect(normalizeMarketMapResources(["voucher", "offer"])).toBeNull();
  });
});

describe("useMarketMapResourceSelection", () => {
  it("starts with Vouchers and Wants, persists individual choices, and allows none", () => {
    const { result } = renderHook(() => useMarketMapResourceSelection("guest"));
    expect(result.current.selected).toEqual(DEFAULT_MARKET_MAP_RESOURCES);

    act(() => result.current.toggle("voucher"));
    act(() => result.current.toggle("want"));
    expect(result.current.selected).toEqual([]);
    expect(
      JSON.parse(window.localStorage.getItem(ownerScopedKey("guest", STORAGE_NAME)) ?? "null"),
    ).toEqual([]);
  });

  it("enables everything from All, then resets active All to Vouchers", () => {
    const { result } = renderHook(() => useMarketMapResourceSelection("guest"));

    act(() => result.current.toggleAll());
    expect(result.current.selected).toEqual(MARKET_MAP_RESOURCE_KINDS);
    expect(result.current.allSelected).toBe(true);

    act(() => result.current.toggleAll());
    expect(result.current.selected).toEqual(["voucher"]);
    expect(result.current.allSelected).toBe(false);
  });

  it("resets an empty or customised selection to the defaults and persists it", () => {
    const { result } = renderHook(() => useMarketMapResourceSelection("guest"));
    expect(result.current.isDefault).toBe(true);

    act(() => result.current.toggle("voucher"));
    act(() => result.current.toggle("want"));
    expect(result.current.selected).toEqual([]);
    expect(result.current.isDefault).toBe(false);

    act(() => result.current.reset());
    expect(result.current.selected).toEqual(DEFAULT_MARKET_MAP_RESOURCES);
    expect(result.current.isDefault).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem(ownerScopedKey("guest", STORAGE_NAME)) ?? "null"),
    ).toEqual([...DEFAULT_MARKET_MAP_RESOURCES]);

    act(() => result.current.toggle("post"));
    expect(result.current.isDefault).toBe(false);
  });

  it("keeps wallet selections isolated and repairs invalid storage", () => {
    window.localStorage.setItem(
      ownerScopedKey("0xaaa", STORAGE_NAME),
      JSON.stringify(["pool", "post"]),
    );
    window.localStorage.setItem(ownerScopedKey("0xbbb", STORAGE_NAME), JSON.stringify(["bad"]));

    const { result, rerender } = renderHook(({ owner }) => useMarketMapResourceSelection(owner), {
      initialProps: { owner: "0xaaa" },
    });
    expect(result.current.selected).toEqual(["pool", "post"]);

    rerender({ owner: "0xbbb" });
    expect(result.current.selected).toEqual(DEFAULT_MARKET_MAP_RESOURCES);

    rerender({ owner: "0xaaa" });
    expect(result.current.selected).toEqual(["pool", "post"]);
  });

  it("repairs malformed JSON from an interrupted storage write", () => {
    window.localStorage.setItem(ownerScopedKey("guest", STORAGE_NAME), "{");

    const { result } = renderHook(() => useMarketMapResourceSelection("guest"));

    expect(result.current.selected).toEqual(DEFAULT_MARKET_MAP_RESOURCES);
  });
});
