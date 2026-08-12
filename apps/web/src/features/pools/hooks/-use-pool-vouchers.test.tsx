import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { usePoolVouchers, usePoolVouchersInfinite } from "./use-pool-vouchers";

const POOL_ADDRESS = "0xAa00000000000000000000000000000000000001";

function createWrapper() {
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

function voucher(id: number) {
  return {
    id,
    address: `0x${id.toString(16).padStart(40, "0")}`,
    name: `Voucher ${id}`,
    symbol: `V${id}`,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pool voucher queries", () => {
  it("requests the pool's vouchers and flattens the loaded pages", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ vouchers: [voucher(1), voucher(2)], first: 1, last: 2 }));
    vi.stubGlobal("fetch", fetcher);

    const { result } = renderHook(() => usePoolVouchers({ address: POOL_ADDRESS } as never), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((v) => v.symbol)).toEqual(["V1", "V2"]);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v2/pools/${POOL_ADDRESS}/vouchers`),
      expect.anything(),
    );
  });

  it("stops paging when a short page proves the end was reached", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ vouchers: [voucher(1)], first: 1, last: 1 }));
    vi.stubGlobal("fetch", fetcher);

    const { result } = renderHook(() => usePoolVouchersInfinite(POOL_ADDRESS, 20), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("issues no request without a pool address", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const { result } = renderHook(() => usePoolVouchersInfinite(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns an empty list rather than undefined before data arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ vouchers: [], first: 0, last: 0 })),
    );

    const { result } = renderHook(() => usePoolVouchers(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current).toEqual([]);
  });
});
