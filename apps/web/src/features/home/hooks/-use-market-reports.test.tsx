import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  query: {
    data: undefined as
      | undefined
      | {
          reports: Array<Record<string, unknown>>;
          tagFacets: Array<{ tag: string; count: number }>;
        },
    error: null as Error | null,
    isFetching: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query }));
vi.mock("@clc/api/features/reports/queries", () => ({
  reportMapQueryOptions: () => ({ queryKey: ["reports", "map"], queryFn: vi.fn() }),
}));
vi.mock("#/lib/api/reports", () => ({ reportsClient: {} }));

import { useMarketMapReports } from "./use-market-reports";

const BOUNDS = [{ minLat: -2, minLng: 35, maxLat: 0, maxLng: 37 }];

beforeEach(() => {
  mocks.query.data = undefined;
  mocks.query.error = null;
  mocks.query.isFetching = false;
  mocks.query.refetch.mockReset();
});

describe("useMarketMapReports", () => {
  it("maps located Posts, skips unlocated Posts, and exposes facets", () => {
    mocks.query.data = {
      reports: [
        {
          id: "7",
          title: "Market day",
          lat: -1,
          lng: 36,
          locationName: "Market",
          markerIcon: "event",
          markerColor: "cyan",
        },
        {
          id: "8",
          title: "No pin",
          lat: null,
          lng: null,
          locationName: null,
          markerIcon: "post",
          markerColor: "pink",
        },
      ],
      tagFacets: [{ tag: "food", count: 2 }],
    };
    const { result } = renderHook(() =>
      useMarketMapReports({ bounds: BOUNDS, enabled: true, facets: true }),
    );

    expect(result.current.reports).toEqual([
      expect.objectContaining({
        id: "market:post:7",
        reportId: "7",
        kind: "post",
        markerIcon: "event",
        markerColor: "cyan",
      }),
    ]);
    expect(result.current.tagFacets).toEqual([{ tag: "food", count: 2 }]);
  });

  it("hides cached rows, facets, and failures as soon as Posts are disabled", () => {
    mocks.query.data = {
      reports: [
        {
          id: "7",
          title: "Market day",
          lat: -1,
          lng: 36,
          locationName: "Market",
          markerIcon: "post",
          markerColor: "pink",
        },
      ],
      tagFacets: [{ tag: "food", count: 1 }],
    };
    mocks.query.error = new Error("offline");
    mocks.query.isFetching = true;
    const { result, rerender } = renderHook(
      ({ enabled }) => useMarketMapReports({ bounds: BOUNDS, enabled, facets: true }),
      { initialProps: { enabled: true } },
    );

    act(() => result.current.retry());
    expect(mocks.query.refetch).toHaveBeenCalled();
    rerender({ enabled: false });
    expect(result.current.reports).toEqual([]);
    expect(result.current.tagFacets).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.retrying).toBe(false);
  });
});
