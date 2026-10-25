import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  options: undefined as
    | undefined
    | { queryFn: (context: { signal: AbortSignal }) => Promise<unknown> },
  list: vi.fn(),
  query: {
    data: undefined as undefined | Array<Record<string, unknown>>,
    error: null as Error | null,
    isFetching: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: (options: { queryFn: (context: { signal: AbortSignal }) => Promise<unknown> }) => {
    mocks.options = options;
    return mocks.query;
  },
}));
vi.mock("#/lib/api/catalogs", () => ({ catalogsClient: { list: mocks.list } }));

import { useMarketMapCatalogs } from "./use-market-catalogs";

const BOUNDS = [{ minLat: -2, minLng: 35, maxLat: 0, maxLng: 37 }];

function catalog(id: string) {
  return {
    id,
    name: `Catalog ${id}`,
    geoLat: -1,
    geoLng: 36,
    locationName: "Market",
  };
}

beforeEach(() => {
  mocks.options = undefined;
  mocks.list.mockReset();
  mocks.query.data = undefined;
  mocks.query.error = null;
  mocks.query.isFetching = false;
  mocks.query.refetch.mockReset();
});

describe("useMarketMapCatalogs", () => {
  it("maps Catalog pins and hides cached rows and failures while disabled", () => {
    mocks.query.data = [catalog("7")];
    mocks.query.error = new Error("offline");
    mocks.query.isFetching = true;
    const { result, rerender } = renderHook(
      ({ enabled }) => useMarketMapCatalogs(BOUNDS, enabled),
      {
        initialProps: { enabled: true },
      },
    );

    expect(result.current.catalogs).toEqual([
      expect.objectContaining({ id: "market:catalog:7", catalogId: "7", kind: "catalog" }),
    ]);
    expect(result.current.error?.message).toBe("offline");
    expect(result.current.retrying).toBe(true);
    act(() => result.current.retry());
    expect(mocks.query.refetch).toHaveBeenCalled();

    rerender({ enabled: false });
    expect(result.current.catalogs).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.retrying).toBe(false);
  });

  it("drains cursor pages with the request abort signal", async () => {
    const signal = new AbortController().signal;
    mocks.list
      .mockResolvedValueOnce({ catalogs: [catalog("2")], nextCursor: "opaque" })
      .mockResolvedValueOnce({ catalogs: [catalog("1")] });
    renderHook(() => useMarketMapCatalogs(BOUNDS, true));

    await expect(mocks.options?.queryFn({ signal })).resolves.toEqual([catalog("2"), catalog("1")]);
    expect(mocks.list).toHaveBeenNthCalledWith(
      1,
      { perPage: 100, cursor: undefined, bounds: BOUNDS, facets: false },
      signal,
    );
    expect(mocks.list).toHaveBeenNthCalledWith(
      2,
      { perPage: 100, cursor: "opaque", bounds: BOUNDS, facets: false },
      signal,
    );
  });
});
