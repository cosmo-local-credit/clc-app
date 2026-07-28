import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useVoucherOfferingsInfinite } from "./use-voucher-offerings";

const VOUCHER_ADDRESS = "0x4444444444444444444444444444444444444444";
const SELLER_ADDRESS = "0x6666666666666666666666666666666666666666";

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    commodityName: `Offering ${id}`,
    quantity: "1",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
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
});
