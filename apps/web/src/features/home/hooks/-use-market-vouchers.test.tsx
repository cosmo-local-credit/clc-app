import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucher, MarketVoucherPage } from "@clc/api/features/market/client";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import {
  MARKET_MAP_PAGE_SIZE,
  marketVoucherQueryKeys,
  useMarketMapVouchers,
} from "./use-market-vouchers";

const getMarketVouchers = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/market/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clc/api/features/market/client")>();
  return { ...actual, getMarketVouchers };
});
vi.mock("#/lib/api/market", async () => ({
  marketClient: await import("@clc/api/features/market/client"),
}));

const NAIROBI_BOUNDS: readonly MarketBoundingBox[] = [
  { minLng: 36.6, minLat: -1.5, maxLng: 37.1, maxLat: -1.1 },
];

function voucher(id: number): MarketVoucher {
  return {
    id: String(id),
    chainId: 100,
    address: `0x${id.toString(16).padStart(40, "0")}` as `0x${string}`,
    name: `Voucher ${id}`,
    symbol: `V${id}`,
    iconUrl: null,
    locationName: "Nairobi",
    lat: -1.29,
    lng: 36.82,
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
  };
}

function page(ids: number[], receivedCount = ids.length): MarketVoucherPage {
  return {
    vouchers: ids.map(voucher),
    first: ids[0] ?? 0,
    last: ids.at(-1) ?? 0,
    receivedCount,
  };
}

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  getMarketVouchers.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("Global voucher discovery", () => {
  it("walks cursor pages to completion", async () => {
    getMarketVouchers.mockResolvedValueOnce(page([3, 2], 2)).mockResolvedValueOnce(page([1], 1));
    const queryClient = client();
    const { result } = renderHook(() => useMarketMapVouchers([], 2), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.vouchers).toHaveLength(3));
    expect(result.current.vouchers.map(({ id }) => id)).toEqual(["3", "2", "1"]);
    expect(getMarketVouchers.mock.calls[1]?.[0]).toMatchObject({ cursor: 2, next: true });
  });

  it("surfaces an error and retries", async () => {
    getMarketVouchers.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useMarketMapVouchers([]), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());

    getMarketVouchers.mockResolvedValueOnce(page([1]));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.vouchers).toHaveLength(1));
  });
});

describe("bounded voucher discovery", () => {
  it("sends one or two canonical boxes in one request", async () => {
    getMarketVouchers.mockResolvedValue(page([]));
    const antimeridian: readonly MarketBoundingBox[] = [
      { minLng: -180, minLat: -2, maxLng: -179, maxLat: 2 },
      { minLng: 179, minLat: -2, maxLng: 180, maxLat: 2 },
    ];
    renderHook(() => useMarketMapVouchers(antimeridian), { wrapper: wrapper(client()) });

    await waitFor(() => expect(getMarketVouchers).toHaveBeenCalled());
    expect(getMarketVouchers.mock.calls[0]?.[0]).toMatchObject({ bounds: antimeridian });
    expect(getMarketVouchers).toHaveBeenCalledTimes(1);
  });

  it("walks bounded pages and passes the AbortSignal through", async () => {
    getMarketVouchers.mockResolvedValueOnce(page([3, 2], 2)).mockResolvedValueOnce(page([1], 1));
    const { result } = renderHook(() => useMarketMapVouchers(NAIROBI_BOUNDS, 2), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => expect(result.current.vouchers).toHaveLength(3));
    expect(getMarketVouchers.mock.calls[0]?.[0]).toMatchObject({ bounds: NAIROBI_BOUNDS });
    expect(getMarketVouchers.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(getMarketVouchers.mock.calls[1]?.[0]).toMatchObject({ cursor: 2, next: true });
  });

  it("cancels obsolete work when the viewport key changes", async () => {
    const signals: AbortSignal[] = [];
    getMarketVouchers.mockImplementation(
      (_params: unknown, signal: AbortSignal) =>
        new Promise<MarketVoucherPage>(() => {
          signals.push(signal);
        }),
    );
    const { rerender } = renderHook(
      ({ bounds }: { bounds: readonly MarketBoundingBox[] }) => useMarketMapVouchers(bounds),
      { wrapper: wrapper(client()), initialProps: { bounds: NAIROBI_BOUNDS } },
    );
    await waitFor(() => expect(signals).toHaveLength(1));

    rerender({ bounds: [{ minLng: 10, minLat: 10, maxLng: 11, maxLat: 11 }] });
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]?.aborted).toBe(true);
  });

  it("retains the last successful rows while a new viewport loads", async () => {
    getMarketVouchers.mockResolvedValueOnce(page([1]));
    const { result, rerender } = renderHook(
      ({ bounds }: { bounds: readonly MarketBoundingBox[] }) => useMarketMapVouchers(bounds),
      { wrapper: wrapper(client()), initialProps: { bounds: NAIROBI_BOUNDS } },
    );
    await waitFor(() => expect(result.current.vouchers.map(({ id }) => id)).toEqual(["1"]));

    getMarketVouchers.mockImplementation(() => new Promise(() => {}));
    rerender({ bounds: [{ minLng: 10, minLat: 10, maxLng: 11, maxLat: 11 }] });
    expect(result.current.vouchers.map(({ id }) => id)).toEqual(["1"]);
  });

  it("retains Global rows while the first bounded viewport loads", async () => {
    getMarketVouchers.mockResolvedValueOnce(page([1]));
    const { result, rerender } = renderHook(
      ({ bounds }: { bounds: readonly MarketBoundingBox[] }) => useMarketMapVouchers(bounds),
      {
        wrapper: wrapper(client()),
        initialProps: { bounds: [] as readonly MarketBoundingBox[] },
      },
    );
    await waitFor(() => expect(result.current.vouchers.map(({ id }) => id)).toEqual(["1"]));

    getMarketVouchers.mockImplementation(() => new Promise(() => {}));
    rerender({ bounds: NAIROBI_BOUNDS });

    expect(result.current.vouchers.map(({ id }) => id)).toEqual(["1"]);
  });

  it("isolates Global and viewport query caches", () => {
    expect(marketVoucherQueryKeys.catalog(MARKET_MAP_PAGE_SIZE)).not.toEqual(
      marketVoucherQueryKeys.viewport(NAIROBI_BOUNDS, MARKET_MAP_PAGE_SIZE),
    );
  });
});
