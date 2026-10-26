import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { MarketMapResponse } from "@clc/core/features/market-map/logic";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("#/lib/api/market-map", () => ({ marketMapClient: { list } }));

import { useMarketMap } from "./use-market-map";

const initial = {
  bounds: [{ minLng: 39.82, minLat: -3.69, maxLng: 39.84, maxLat: -3.67 }],
  zoom: 16,
  kinds: ["voucher", "want"] as const,
  filter: { term: "", tags: [], tagMatch: "any" as const },
  facets: false,
  enabled: true,
};
const markers: MarketMapResponse = {
  features: [
    {
      type: "marker",
      id: "voucher:1",
      kind: "voucher",
      resourceId: "0x1",
      name: "Local voucher",
      lat: -3.68,
      lng: 39.83,
      markerIcon: null,
      markerColor: null,
    },
  ],
};
const clusters: MarketMapResponse = {
  features: [
    {
      type: "cluster",
      id: "cluster:8:1:2",
      lat: -3.68,
      lng: 39.83,
      count: 12,
      kinds: { voucher: 11, want: 1 },
      expansionZoom: 16,
    },
  ],
};

function pendingResponse() {
  let resolve!: (value: MarketMapResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<MarketMapResponse>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function renderMapQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook((options) => useMarketMap(options), { initialProps: initial, wrapper });
}

beforeEach(() => list.mockReset());

describe("map discovery request lifecycle", () => {
  it("fetches a restored decimal viewport immediately and keeps prior pins during refresh", async () => {
    const next = pendingResponse();
    list.mockResolvedValueOnce(markers).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderMapQuery();
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ bounds: initial.bounds, zoom: 16 }),
      expect.any(AbortSignal),
    );

    rerender({ ...initial, bounds: [{ ...initial.bounds[0]!, maxLng: 39.85 }] });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(result.current.isFetching).toBe(true);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isSettled).toBe(false);
    expect(result.current.locations).toHaveLength(1);
    await act(async () => next.resolve(clusters));
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(result.current.locations).toHaveLength(0);
    expect(result.current.clusters).toHaveLength(1);
  });

  it("cancels an obsolete viewport and ignores its late response", async () => {
    const old = pendingResponse();
    const current = pendingResponse();
    list
      .mockResolvedValueOnce(markers)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const { result, rerender } = renderMapQuery();
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    rerender({ ...initial, zoom: 15 });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    const oldSignal = list.mock.calls[1]![1] as AbortSignal;
    rerender({ ...initial, zoom: 14 });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => current.resolve(clusters));
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    await act(async () => old.resolve({ features: [] }));
    expect(result.current.clusters).toHaveLength(1);
    expect(result.current.locations).toHaveLength(0);
  });

  it("retains successful clusters after a final failure and replaces them on Retry", async () => {
    list.mockResolvedValueOnce(clusters).mockRejectedValueOnce(new Error("Connection lost"));
    const { result, rerender } = renderMapQuery();
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    rerender({ ...initial, zoom: 15 });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.clusters).toHaveLength(1);
    expect(result.current.isSettled).toBe(false);
    list.mockResolvedValueOnce(markers);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.locations).toHaveLength(1);
    expect(result.current.clusters).toHaveLength(0);
  });
});
