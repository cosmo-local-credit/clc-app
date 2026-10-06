import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { UserPool, UserPoolPage } from "@clc/api/features/pools/client";
import { useMarketMapPools } from "./use-market-pools";

const getPools = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/pools", () => ({ poolsClient: { getPools } }));

function pool(id: number, overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: String(id),
    address: `0x${id.toString(16).padStart(40, "0")}`,
    name: `Pool ${id}`,
    locationName: `Place ${id}`,
    geoLat: -1.29,
    geoLng: 36.82,
    ...overrides,
  } as UserPool;
}

function page(pools: UserPool[], perPage = 100): UserPoolPage {
  return {
    pools,
    first: Number(pools[0]?.id ?? 0),
    last: Number(pools.at(-1)?.id ?? 0),
    // A short page ends the walk; a full one asks for the next.
    receivedCount: pools.length === 0 ? 0 : perPage,
  };
}

function renderPools(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMarketMapPools(enabled), { wrapper });
}

beforeEach(() => {
  getPools.mockReset();
});

describe("useMarketMapPools", () => {
  it("maps every located pool to a pool marker with a namespaced id", async () => {
    const address = "0x49D3E72BECC7870Cd9d1981d5F4eC8e1CB5394E2";
    getPools.mockResolvedValueOnce({ ...page([pool(7, { address })]), receivedCount: 1 });

    const { result } = renderPools();

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toEqual({
      id: "pool:0x49d3e72becc7870cd9d1981d5f4ec8e1cb5394e2",
      name: "Pool 7",
      kind: "pool",
      markerIcon: null,
      markerColor: null,
      lat: -1.29,
      lng: 36.82,
      locationName: "Place 7",
      address,
    });
    // Asked for the largest page clc-core serves.
    expect(getPools.mock.calls[0]?.[0]).toMatchObject({ perPage: 100 });
  });

  it("leaves off pools with no coordinate, or one outside the globe", async () => {
    getPools.mockResolvedValueOnce({
      ...page([
        pool(1),
        pool(2, { geoLat: null }),
        pool(3, { geoLng: null }),
        pool(4, { geoLat: 91 }),
        pool(5, { geoLng: -181 }),
      ]),
      receivedCount: 5,
    });

    const { result } = renderPools();

    await waitFor(() => expect(getPools).toHaveBeenCalled());
    await waitFor(() => expect(result.current.map((entry) => entry.name)).toEqual(["Pool 1"]));
  });

  it("walks every page of the catalog", async () => {
    getPools
      .mockResolvedValueOnce(page([pool(9), pool(8)]))
      .mockResolvedValueOnce({ ...page([pool(2)]), receivedCount: 1 });

    const { result } = renderPools();

    await waitFor(() =>
      expect(result.current.map((entry) => entry.name)).toEqual(["Pool 9", "Pool 8", "Pool 2"]),
    );
    expect(getPools).toHaveBeenCalledTimes(2);
    expect(getPools.mock.calls[1]?.[0]).toMatchObject({ cursor: 8, next: true });
  });

  it("requests nothing while disabled", () => {
    const { result } = renderPools(false);

    expect(result.current).toEqual([]);
    expect(getPools).not.toHaveBeenCalled();
  });
});
