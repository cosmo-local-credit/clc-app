import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { offeringKeys } from "@clc/api/features/offerings/queries";

import {
  useCurrentVoucherOfferingsInfinite,
  usePoolOfferingsInfinite,
  useVoucherOfferingsInfinite,
} from "./use-voucher-offerings";

const VOUCHER_ADDRESS = "0x4444444444444444444444444444444444444444";
const SELLER_ADDRESS = "0x6666666666666666666666666666666666666666";
const POOL_ADDRESS = "0x7777777777777777777777777777777777777777";

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapper(queryClient = newClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function response(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  };
}

function offering(id: number) {
  return {
    id,
    voucherId: 10,
    voucherAddress: VOUCHER_ADDRESS,
    sellerAddress: SELLER_ADDRESS,
    name: `Offering ${id}`,
    quantity: "1",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe("useVoucherOfferingsInfinite", () => {
  it("follows descending cursor pages and stops on a short page", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ offerings: [offering(10), offering(9)], first: 10, last: 9 }),
      )
      .mockResolvedValueOnce(response({ offerings: [offering(8)], first: 8, last: 8 }));
    vi.stubGlobal("fetch", fetcher);

    const { result } = renderHook(() => useVoucherOfferingsInfinite(VOUCHER_ADDRESS, 2), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings?perPage=2&cursor=9&next=true`,
      ),
      expect.objectContaining({ credentials: "omit", method: "GET" }),
    );
  });

  it("does not request a page without a voucher address", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const { result } = renderHook(() => useVoucherOfferingsInfinite(undefined), {
      wrapper: wrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bypasses the public browser cache when verifying receipt order availability", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ offerings: [offering(10)], first: 10, last: 10 }));
    vi.stubGlobal("fetch", fetcher);

    const client = newClient();
    client.setQueryData(offeringKeys.byVoucherInfinite(VOUCHER_ADDRESS, 20), {
      pages: [{ offerings: [], first: 0, last: 0, receivedCount: 0 }],
      pageParams: [undefined],
    });
    const { result } = renderHook(() => useCurrentVoucherOfferingsInfinite(VOUCHER_ADDRESS), {
      wrapper: wrapper(client),
    });

    expect(result.current.isFetching).toBe(true);
    await waitFor(() => expect(result.current.data?.pages[0]?.offerings).toHaveLength(1));
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/vouchers/${VOUCHER_ADDRESS}/offerings`),
      expect.objectContaining({ cache: "no-store", credentials: "omit", method: "GET" }),
    );
  });
});

describe("usePoolOfferingsInfinite", () => {
  it("refreshes a cached empty result when returning to the pool's Offers tab", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ offerings: [], first: 0, last: 0 }))
      .mockResolvedValue(response({ offerings: [offering(10)], first: 10, last: 10 }));
    vi.stubGlobal("fetch", fetcher);
    const client = newClient();
    const provider = wrapper(client);
    const firstVisit = renderHook(() => usePoolOfferingsInfinite(POOL_ADDRESS), {
      wrapper: provider,
    });
    await waitFor(() => expect(firstVisit.result.current.isSuccess).toBe(true));
    expect(firstVisit.result.current.data?.pages[0]?.offerings).toEqual([]);
    firstVisit.unmount();

    // The same browser session and query cache survive the tab switch.
    const nextVisit = renderHook(() => usePoolOfferingsInfinite(POOL_ADDRESS), {
      wrapper: provider,
    });
    await waitFor(() => expect(nextVisit.result.current.data?.pages[0]?.offerings).toHaveLength(1));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining(`/api/v2/pools/${POOL_ADDRESS}/offerings`),
      expect.objectContaining({ cache: "no-store", credentials: "omit", method: "GET" }),
    );
    nextVisit.unmount();
    client.clear();
  });

  it("picks up delayed indexing while Offers stays open, then stops refreshing when it closes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ offerings: [], first: 0, last: 0 }))
      .mockResolvedValue(response({ offerings: [offering(10)], first: 10, last: 10 }));
    vi.stubGlobal("fetch", fetcher);
    vi.useFakeTimers();
    focusManager.setFocused(true);
    const client = newClient();
    const view = renderHook(() => usePoolOfferingsInfinite(POOL_ADDRESS), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(view.result.current.data?.pages[0]?.offerings).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
    expect(view.result.current.data?.pages[0]?.offerings).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);

    act(() => focusManager.setFocused(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);

    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    client.clear();
  });

  it("does not fetch or poll without a pool address", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.useFakeTimers();
    focusManager.setFocused(true);
    const client = newClient();
    const view = renderHook(() => usePoolOfferingsInfinite(undefined), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(view.result.current.fetchStatus).toBe("idle");
    expect(fetcher).not.toHaveBeenCalled();
    view.unmount();
    client.clear();
  });
});
