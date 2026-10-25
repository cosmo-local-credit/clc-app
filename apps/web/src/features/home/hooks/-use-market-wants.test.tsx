import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  options: undefined as
    | undefined
    | { queryFn: (context: { signal: AbortSignal }) => Promise<unknown> },
  list: vi.fn(),
  refetch: vi.fn(),
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
vi.mock("#/lib/api/wants", () => ({ wantsClient: { list: mocks.list } }));

import { useMarketMapWants } from "./use-market-wants";

const BOUNDS = [{ minLat: -2, minLng: 35, maxLat: 0, maxLng: 37 }];

function want(id: string) {
  return {
    id,
    name: `Want ${id}`,
    markerIcon: "question",
    markerColor: "orange",
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

describe("useMarketMapWants", () => {
  it("maps Want markers and exposes retry state only while enabled", () => {
    mocks.query.data = [want("7")];
    mocks.query.error = new Error("offline");
    mocks.query.isFetching = true;
    const { result, rerender } = renderHook(({ enabled }) => useMarketMapWants(BOUNDS, enabled), {
      initialProps: { enabled: true },
    });

    expect(result.current.wants).toEqual([
      expect.objectContaining({ id: "market:want:7", wantId: "7", kind: "want" }),
    ]);
    expect(result.current.error?.message).toBe("offline");
    expect(result.current.retrying).toBe(true);
    act(() => result.current.retry());
    expect(mocks.query.refetch).toHaveBeenCalled();

    rerender({ enabled: false });
    expect(result.current.error).toBeNull();
    expect(result.current.retrying).toBe(false);
  });

  it("drains full pages and stops on the first short page", async () => {
    const full = Array.from({ length: 100 }, (_, index) => want(String(index + 1)));
    mocks.list
      .mockResolvedValueOnce({ wants: full, first: 1, last: 100 })
      .mockResolvedValueOnce({ wants: [want("101")], first: 101, last: 101 });
    renderHook(() => useMarketMapWants(BOUNDS, true));
    const signal = new AbortController().signal;

    await expect(mocks.options?.queryFn({ signal })).resolves.toHaveLength(101);
    expect(mocks.list).toHaveBeenNthCalledWith(
      1,
      { perPage: 100, cursor: undefined, bounds: BOUNDS },
      signal,
    );
    expect(mocks.list).toHaveBeenNthCalledWith(
      2,
      { perPage: 100, cursor: 100, bounds: BOUNDS },
      signal,
    );
  });

  it("stops when a full page has a terminal or non-advancing cursor", async () => {
    const full = Array.from({ length: 100 }, (_, index) => want(String(index + 1)));
    for (const pages of [
      [{ wants: full, first: 1, last: 0 }],
      [
        { wants: full, first: 1, last: 100 },
        { wants: full, first: 1, last: 100 },
      ],
    ]) {
      mocks.list.mockReset();
      for (const page of pages) mocks.list.mockResolvedValueOnce(page);
      renderHook(() => useMarketMapWants(BOUNDS, true));
      await expect(
        mocks.options?.queryFn({ signal: new AbortController().signal }),
      ).resolves.toHaveLength(100 * pages.length);
      expect(mocks.list).toHaveBeenCalledTimes(pages.length);
    }
  });
});
