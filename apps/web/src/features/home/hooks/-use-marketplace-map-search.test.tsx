import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const list = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/marketplace", () => ({ marketplaceClient: { list } }));
vi.mock("#/components/nearby-catalog", () => ({
  useNearbyCatalog: () => null,
  nearbyQueryPolicy: () => ({}),
}));

import { useMarketplaceMapSearch } from "./use-marketplace-map-search";

const filter = {
  result: { ok: true as const, filter: { term: "repair", tags: [], tagMatch: "any" as const } },
} as never;
const common = {
  description: null,
  imageUrl: null,
  locationName: "Kilifi",
  geoLat: -3.63,
  geoLng: 39.85,
  distanceMeters: null,
  tags: [],
  voucherAddress: null,
  voucherName: null,
  voucherSymbol: null,
  voucherUoa: null,
  priceInUnitOfAccount: null,
  unit: null,
  poolCount: null,
  createdAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:00:00Z",
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => list.mockReset());

describe("useMarketplaceMapSearch", () => {
  it("walks the complete filtered feed and maps only voucher and pool markers", async () => {
    list
      .mockResolvedValueOnce({
        results: [
          {
            ...common,
            kind: "voucher",
            id: "1",
            chainId: 100,
            address: `0x${"a".repeat(40)}`,
            name: "Repair Voucher",
            symbol: "RPR",
            markerIcon: "tools",
            markerColor: "orange",
            voucherKind: "services",
            voucherCount: null,
          },
        ],
        nextCursor: "next",
      })
      .mockResolvedValueOnce({
        results: [
          {
            ...common,
            kind: "pool",
            id: "2",
            chainId: 100,
            address: `0x${"b".repeat(40)}`,
            name: "Repair Pool",
            symbol: "POOL",
            markerIcon: null,
            markerColor: null,
            voucherKind: null,
            voucherCount: 2,
          },
          {
            ...common,
            kind: "want",
            id: "3",
            chainId: null,
            address: null,
            name: "Repair wanted",
            symbol: null,
            markerIcon: "question",
            markerColor: "orange",
            voucherKind: null,
            voucherCount: null,
          },
        ],
        nextCursor: null,
      });

    const { result } = renderHook(() => useMarketplaceMapSearch(filter, undefined, [], true), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.locations.map((row) => row.kind)).toEqual(["services", "pool", "want"]);
    expect(result.current.locations[0]).toMatchObject({
      id: "market:voucher:1",
      markerIcon: "tools",
      markerColor: "orange",
    });
    expect(result.current.locations[2]).toMatchObject({
      id: "market:want:3",
      wantId: "3",
      markerIcon: "question",
      markerColor: "orange",
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0]?.[0]).toMatchObject({
      kinds: ["voucher", "pool", "want"],
      perPage: 100,
      q: "repair",
    });
    expect(list.mock.calls[1]?.[0].cursor).toBe("next");
  });

  it("makes no request and exposes no locations while verification blocks search", () => {
    const { result } = renderHook(() => useMarketplaceMapSearch(filter, undefined, [], false), {
      wrapper: wrapper(),
    });
    expect(result.current.status).toBe("disabled");
    expect(result.current.locations).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it("walks every bounded page without an arbitrary client-side cutoff", async () => {
    let page = 0;
    list.mockImplementation(async () => {
      page++;
      return { results: [], nextCursor: page < 8 ? `page-${page + 1}` : null };
    });
    const { result } = renderHook(() => useMarketplaceMapSearch(filter, undefined, [], true), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.locations).toEqual([]);
    expect(list).toHaveBeenCalledTimes(8);
  });
});
