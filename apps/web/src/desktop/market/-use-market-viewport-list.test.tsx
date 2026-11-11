import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("#/lib/api/marketplace", () => ({ marketplaceClient: { list: mocks.list } }));

import { useMarketViewportList } from "./use-market-viewport-list";

const BOUNDS = [{ minLng: 39.5, minLat: -4.2, maxLng: 39.8, maxLat: -3.9 }] as const;
const POOL = "0x0000000000000000000000000000000000000001";

function row(id: string): MarketplaceResult {
  return {
    kind: "post",
    id,
    name: `Post ${id}`,
    chainId: 100,
    address: null,
    tags: [],
    geoLat: -4,
    geoLng: 39.7,
  } as unknown as MarketplaceResult;
}

function page(ids: string[], nextCursor: string | null = null, total = ids.length) {
  return { results: ids.map(row), nextCursor, total, tagFacets: [] };
}

function setup({
  settled = true,
  kinds = ["voucher", "post"],
}: {
  settled?: boolean;
  kinds?: readonly ("voucher" | "post")[];
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    (props: { settled: boolean; kinds: readonly ("voucher" | "post")[] }) =>
      useMarketViewportList({
        filter: {
          result: {
            ok: true,
            filter: {
              term: "repair",
              tags: ["Reuse"],
              tagMatch: "all",
              vouchers: [],
              voucherMatch: "any",
            },
          },
          isRestoringPreference: false,
          isDebouncing: false,
        } as never,
        credit: {
          enabled: true,
          blocksResults: false,
          poolRefs: [{ chainId: 100, address: POOL }],
        } as never,
        output: { blocksResults: false, poolRefs: [{ chainId: 100, address: POOL }] },
        kinds: props.kinds,
        bounds: BOUNDS,
        settled: props.settled,
        postTiming: "future",
      }),
    { wrapper, initialProps: { settled, kinds } },
  );
}

beforeEach(() => mocks.list.mockReset());

describe("useMarketViewportList", () => {
  it("waits for a settled camera and sends the exact bounds, filters, kinds and nearest sort", async () => {
    mocks.list.mockResolvedValue(page(["1"], null, 1201));
    const { result, rerender } = setup({ settled: false });
    expect(mocks.list).not.toHaveBeenCalled();

    rerender({ settled: true, kinds: ["voucher", "post"] });
    await waitFor(() => expect(result.current.hasData).toBe(true));
    expect(mocks.list.mock.calls[0]?.[0]).toMatchObject({
      bounds: BOUNDS,
      q: "repair",
      tags: ["Reuse"],
      tagMatch: "all",
      kinds: ["voucher", "post"],
      pools: [{ chainId: 100, address: POOL }],
      sort: "nearest",
      perPage: 20,
      postTiming: "future",
    });
    expect(result.current.rows.map((entry) => entry.id)).toEqual(["1"]);
    expect(result.current.total).toBe(1201);
  });

  it("pages the exact cursor chain and keeps the complete filtered total", async () => {
    mocks.list
      .mockResolvedValueOnce(page(["1"], "cursor-2", 2))
      .mockResolvedValueOnce(page(["2"], null, 2));
    const { result } = setup();
    await waitFor(() => expect(result.current.next.hasMore).toBe(true));

    act(() => result.current.next.load());
    await waitFor(() => expect(result.current.rows.map((entry) => entry.id)).toEqual(["1", "2"]));
    expect(mocks.list.mock.calls[1]?.[0]).toMatchObject({ cursor: "cursor-2", bounds: BOUNDS });
    expect(result.current.total).toBe(2);
  });

  it("makes no request when every resource type is disabled", () => {
    mocks.list.mockResolvedValue(page([]));
    const { result } = setup({ kinds: [] });
    expect(result.current.blocked).toBe(true);
    expect(result.current.hasData).toBe(false);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
