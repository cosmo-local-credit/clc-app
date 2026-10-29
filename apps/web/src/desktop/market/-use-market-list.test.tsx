import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("#/lib/api/marketplace", () => ({ marketplaceClient: { list: mocks.list } }));

import { useMarketList } from "./use-market-list";

const POOL = "0x0000000000000000000000000000000000000001";

function row(id: number, kind: "voucher" | "pool" = "voucher"): MarketplaceResult {
  return {
    kind,
    id: String(id),
    name: `Row ${id}`,
    chainId: 100,
    address: `0x${id.toString(16).padStart(40, "0")}`,
    tags: [],
  } as unknown as MarketplaceResult;
}

function page(ids: number[], nextCursor: string | null = null) {
  return { results: ids.map((id) => row(id)), nextCursor, tagFacets: [] };
}

type Props = {
  term?: string;
  credit?: { blocksResults: boolean };
  output?: { blocksResults: boolean; poolRefs?: { chainId: number; address: string }[] };
  isDebouncing?: boolean;
};

function setup(initial: Props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    (props: Props) =>
      useMarketList({
        scope: "vouchers",
        filter: {
          result: {
            ok: true,
            filter: {
              term: props.term ?? "",
              tags: [],
              tagMatch: "any",
              vouchers: [],
              voucherMatch: "any",
            },
          },
          isRestoringPreference: false,
          isDebouncing: props.isDebouncing ?? false,
        } as never,
        credit: { blocksResults: false, ...props.credit } as never,
        output: { blocksResults: false, poolRefs: undefined, ...props.output } as never,
      }),
    { wrapper, initialProps: initial },
  );
}

beforeEach(() => mocks.list.mockReset());

describe("useMarketList", () => {
  it("is loading until a result set arrives, then ready with its rows", async () => {
    mocks.list.mockResolvedValueOnce(page([1, 2]));
    const { result } = setup();
    expect(result.current.phase).toBe("loading");
    expect(result.current.rows).toEqual([]);

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.rows.map((entry) => entry.name)).toEqual(["Row 1", "Row 2"]);
    expect(result.current.next.hasMore).toBe(false);
  });

  it("is failed, with nothing to keep, when the first request fails, and recovers on retry", async () => {
    mocks.list.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(page([7]));
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("failed"));
    expect(result.current.rows).toEqual([]);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.rows.map((entry) => entry.id)).toEqual(["7"]);
  });

  it("keeps the rows it has when the next page fails, and says so instead of ending the list", async () => {
    mocks.list
      .mockResolvedValueOnce(page([1, 2], "cursor-2"))
      .mockRejectedValueOnce(new Error("page two down"))
      .mockResolvedValueOnce(page([3]));
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.next.hasMore).toBe(true);

    act(() => result.current.next.load());
    await waitFor(() => expect(result.current.next.failed).toBe(true));
    // The last good rows stay, and more are still to come: this is not the end.
    expect(result.current.phase).toBe("ready");
    expect(result.current.rows.map((entry) => entry.id)).toEqual(["1", "2"]);
    expect(result.current.next.hasMore).toBe(true);
    expect(result.current.refreshFailed).toBe(false);

    act(() => result.current.next.load());
    await waitFor(() =>
      expect(result.current.rows.map((entry) => entry.id)).toEqual(["1", "2", "3"]),
    );
    expect(result.current.next.failed).toBe(false);
    expect(result.current.next.hasMore).toBe(false);
  });

  it("keeps the previous search's rows, marked retained, while a refined search loads", async () => {
    let finish: (value: ReturnType<typeof page>) => void = () => {};
    mocks.list
      .mockResolvedValueOnce(page([1, 2, 3]))
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.retained).toBe(false);

    rerender({ term: "bread" });
    await waitFor(() => expect(result.current.refreshing).toBe(true));
    expect(result.current.phase).toBe("ready");
    expect(result.current.retained).toBe(true);
    expect(result.current.rows.map((entry) => entry.id)).toEqual(["1", "2", "3"]);
    // The old rows' pages are not the new search's: nothing more to auto-load.
    expect(result.current.next.hasMore).toBe(false);

    await act(async () => finish(page([2])));
    await waitFor(() => expect(result.current.retained).toBe(false));
    expect(result.current.rows.map((entry) => entry.id)).toEqual(["2"]);
  });

  it("calls a settled search with no rows ready and empty, not loading", async () => {
    mocks.list.mockResolvedValueOnce(page([]));
    const { result } = setup({ term: "zzz" });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.count).toBe(0);
    expect(result.current.rows).toEqual([]);
  });

  it("shows no rows and makes no request while Credit or the output blocks, instead of broadening", async () => {
    mocks.list.mockResolvedValue(page([1]));
    const { result } = setup({ credit: { blocksResults: true } });
    expect(result.current.phase).toBe("blocked");
    expect(result.current.rows).toEqual([]);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("drops rows it already had when a block starts, so a stale unrestricted list cannot show", async () => {
    mocks.list.mockResolvedValue(page([1, 2]));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.phase).toBe("ready"));

    rerender({ output: { blocksResults: true } });
    expect(result.current.phase).toBe("blocked");
    expect(result.current.rows).toEqual([]);
  });

  it("sends the pool restriction (output and Credit already intersected) to the request", async () => {
    mocks.list.mockResolvedValueOnce(page([5]));
    const pools = [{ chainId: 100, address: POOL }];
    const { result } = setup({ output: { blocksResults: false, poolRefs: pools } });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(mocks.list.mock.calls[0]?.[0]).toMatchObject({ pools, kinds: ["voucher"] });
  });

  it("holds the search request while the term is still debouncing, with the rows kept", async () => {
    mocks.list.mockResolvedValueOnce(page([1]));
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.phase).toBe("ready"));

    rerender({ isDebouncing: true });
    expect(result.current.retained).toBe(true);
    expect(result.current.rows).toHaveLength(1);
  });
});
