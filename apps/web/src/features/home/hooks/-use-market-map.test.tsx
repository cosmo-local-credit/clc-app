import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  query: {
    data: undefined as
      | undefined
      | {
          features: Array<Record<string, unknown>>;
          tagFacets?: Array<{ tag: string; count: number }>;
        },
    error: null as Error | null,
    isFetching: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  options: vi.fn(() => ({ queryKey: ["market-map"], queryFn: vi.fn() })),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: () => mocks.query,
}));
vi.mock("@clc/api/features/market-map/queries", () => ({
  marketMapQueryOptions: mocks.options,
}));
vi.mock("#/lib/api/market-map", () => ({ marketMapClient: {} }));

import { useMarketMap } from "./use-market-map";

const options = {
  bounds: [{ minLat: -2, minLng: 35, maxLat: 0, maxLng: 37 }],
  zoom: 9,
  kinds: ["voucher", "post"] as const,
  filter: { term: "market", tags: ["Food"], tagMatch: "any" as const },
  facets: true,
  enabled: true,
};

beforeEach(() => {
  mocks.query.data = undefined;
  mocks.query.error = null;
  mocks.query.isFetching = false;
  mocks.query.isPending = false;
  mocks.query.isError = false;
  mocks.query.refetch.mockReset();
  mocks.options.mockClear();
});

describe("useMarketMap", () => {
  it("separates lightweight markers from server clusters and exposes facets", () => {
    mocks.query.data = {
      features: [
        {
          type: "marker",
          id: "marker:voucher:1",
          kind: "voucher",
          resourceId: `0x${"a".repeat(40)}`,
          name: "Market voucher",
          lat: -1,
          lng: 36,
          markerIcon: "goods",
          markerColor: "orange",
        },
        {
          type: "cluster",
          id: "cluster:9:1:2",
          lat: -1.1,
          lng: 36.1,
          count: 18,
          kinds: { voucher: 12, post: 6 },
          expansionZoom: 11,
        },
      ],
      tagFacets: [{ tag: "Food", count: 18 }],
    };

    const { result } = renderHook(() => useMarketMap(options));

    expect(result.current.locations).toEqual([
      expect.objectContaining({
        id: "marker:voucher:1",
        resourceKind: "voucher",
        resourceId: `0x${"a".repeat(40)}`,
        kind: "voucher",
      }),
    ]);
    expect(result.current.clusters).toEqual([
      expect.objectContaining({ id: "cluster:9:1:2", count: 18 }),
    ]);
    expect(result.current.tagFacets).toEqual([{ tag: "Food", count: 18 }]);
    expect(result.current.status).toBe("ready");
    expect(mocks.options).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ zoom: 9, kinds: ["voucher", "post"], facets: true }),
    );
  });

  it("retains an error for recovery and retries on demand", () => {
    mocks.query.error = new Error("rate limited");
    mocks.query.isError = true;
    const { result } = renderHook(() => useMarketMap(options));

    expect(result.current.status).toBe("error");
    expect(result.current.error).toEqual(new Error("rate limited"));
    act(() => result.current.retry());
    expect(mocks.query.refetch).toHaveBeenCalledOnce();
  });

  it("clears retained features immediately when resource selection is empty", () => {
    mocks.query.data = {
      features: [
        {
          type: "marker",
          id: "marker:post:7",
          kind: "post",
          resourceId: "7",
          name: "Post",
          lat: -1,
          lng: 36,
          markerIcon: "post",
          markerColor: "pink",
        },
      ],
    };
    mocks.query.error = new Error("stale");
    mocks.query.isFetching = true;

    const { result } = renderHook(() => useMarketMap({ ...options, enabled: false }));

    expect(result.current.status).toBe("disabled");
    expect(result.current.locations).toEqual([]);
    expect(result.current.clusters).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.retrying).toBe(false);
  });
});
