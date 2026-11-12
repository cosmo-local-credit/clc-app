import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { MarketMapPointsResponse } from "@clc/core/features/market-map/logic";

const { points, facets } = vi.hoisted(() => ({ points: vi.fn(), facets: vi.fn() }));
vi.mock("#/lib/api/market-map", () => ({ marketMapClient: { points, facets } }));

import { useMarketMap } from "./use-market-map";
import { useMarketMapFacets } from "./use-market-map-facets";

const initial = {
  kinds: ["voucher", "want"] as const,
  filter: { term: "", tags: [] as string[], tagMatch: "any" as const },
  enabled: true,
};
const local: MarketMapPointsResponse = {
  points: [
    {
      kind: "voucher",
      resourceId: "0x1",
      name: "Local voucher",
      lat: -3.6884991293904363,
      lng: 39.830381973540625,
      markerIcon: null,
      markerColor: null,
    },
  ],
  truncated: false,
};
const filtered: MarketMapPointsResponse = {
  points: [
    { ...local.points[0]!, resourceId: "0x2", name: "Food voucher" },
    { ...local.points[0]!, resourceId: "0x3", name: "Food voucher two", lat: 1.5, lng: -2.25 },
  ],
  truncated: false,
};

function pendingResponse<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function renderMapQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  return renderHook((options) => useMarketMap(options), {
    initialProps: initial,
    wrapper: wrapperFor(client),
  });
}

beforeEach(() => {
  points.mockReset();
  facets.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("map points request lifecycle", () => {
  it("is pending, then ready, and keeps the previous filter's points during a refetch", async () => {
    const next = pendingResponse<MarketMapPointsResponse>();
    points.mockResolvedValueOnce(local).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderMapQuery();
    expect(result.current.status).toBe("loading");
    expect(result.current.hasData).toBe(false);
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(points).toHaveBeenCalledWith(
      expect.not.objectContaining({ bounds: expect.anything() }),
      expect.any(AbortSignal),
    );

    rerender({ ...initial, filter: { ...initial.filter, term: "food" } });
    await waitFor(() => expect(points).toHaveBeenCalledTimes(2));
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isSettled).toBe(false);
    expect(result.current.locations.map((location) => location.name)).toEqual(["Local voucher"]);
    await act(async () => next.resolve(filtered));
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(result.current.locations).toHaveLength(2);
    expect(result.current.locations[1]).toMatchObject({ lat: 1.5, lng: -2.25 });
  });

  it("settles an empty response as ready with no points", async () => {
    points.mockResolvedValueOnce({ points: [], truncated: false });
    const { result } = renderMapQuery();
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(result.current.status).toBe("ready");
    expect(result.current.hasData).toBe(true);
    expect(result.current.locations).toEqual([]);
  });

  it("surfaces a truncated response", async () => {
    points.mockResolvedValueOnce({ ...local, truncated: true });
    const { result } = renderMapQuery();
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(result.current.truncated).toBe(true);
  });

  it("retains successful points after a final failure and replaces them on Retry", async () => {
    points.mockResolvedValueOnce(local).mockRejectedValueOnce(new Error("Connection lost"));
    const { result, rerender } = renderMapQuery();
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    rerender({ ...initial, kinds: ["voucher"] as never });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.locations).toHaveLength(1);
    expect(result.current.isSettled).toBe(false);
    points.mockResolvedValueOnce(filtered);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.locations).toHaveLength(2);
  });

  it("issues no request when only the viewport changes", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    points.mockResolvedValue(local);
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    const { result, rerender } = renderHook(
      ({ zoom }: { zoom: number }) => {
        // A viewport the screen would hold; the points hook does not take one.
        void zoom;
        return useMarketMap(initial);
      },
      { initialProps: { zoom: 5 }, wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    for (const zoom of [6, 9.5, 13, 16]) rerender({ zoom });
    await act(async () => {});
    expect(points).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("map facets request lifecycle", () => {
  it("waits for the filters to be opened, then counts the exact visible boxes", async () => {
    facets.mockResolvedValue({
      tagFacets: [{ tag: "Food", count: 2 }],
      postVoucherFacets: [],
      postPoolFacets: [],
    });
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    const box = { minLng: 39.82, minLat: -3.69, maxLng: 39.84, maxLat: -3.67 };
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useMarketMapFacets({ ...initial, bounds: [box], enabled }),
      { initialProps: { enabled: false }, wrapper: wrapperFor(client) },
    );
    await act(async () => {});
    expect(facets).not.toHaveBeenCalled();
    expect(result.current.tagFacets).toEqual([]);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.tagFacets).toEqual([{ tag: "Food", count: 2 }]));
    expect(facets).toHaveBeenCalledWith(
      expect.objectContaining({ bounds: [box] }),
      expect.any(AbortSignal),
    );
  });
});
