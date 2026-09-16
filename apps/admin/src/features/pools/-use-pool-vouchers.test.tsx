import type { PoolVoucher } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { hasVoucher, settlingVoucher, usePoolVouchers } from "./use-pool-vouchers";

const ADDRESS = "0xdD97a5282D11e55d7271d466C80963d6793B276f";
const RIBA = "0x3aa7000000000000000000000000000000000102";

const getPoolVouchers = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api", () => ({
  clcApi: { pools: { getPoolVouchers: (...args: unknown[]) => getPoolVouchers(...args) } },
}));

function voucher(address: string): PoolVoucher {
  return { id: address, tokenAddress: address, symbol: "RIBA" } as PoolVoucher;
}

function wrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  getPoolVouchers.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePoolVouchers", () => {
  it("does not poll a pool with nothing settling", async () => {
    getPoolVouchers.mockResolvedValue({ vouchers: [] });

    renderHook(() => usePoolVouchers(ADDRESS, null), { wrapper: wrapper() });
    await waitFor(() => expect(getPoolVouchers).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getPoolVouchers).toHaveBeenCalledTimes(1);
  });

  it("keeps refetching until the indexer records the voucher, then stops", async () => {
    // The transaction confirms seconds before clc-core projects it, so the first
    // read after a successful add legitimately still shows the old composition.
    getPoolVouchers.mockResolvedValue({ vouchers: [] });

    renderHook(() => usePoolVouchers(ADDRESS, settlingVoucher(RIBA)), { wrapper: wrapper() });
    await waitFor(() => expect(getPoolVouchers).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(7_000);
    const whilePolling = getPoolVouchers.mock.calls.length;
    expect(whilePolling).toBeGreaterThan(1);

    getPoolVouchers.mockResolvedValue({ vouchers: [voucher(RIBA)] });
    await vi.advanceTimersByTimeAsync(4_000);
    const atArrival = getPoolVouchers.mock.calls.length;

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getPoolVouchers).toHaveBeenCalledTimes(atArrival);
  });

  it("gives up on a deadline rather than polling a row that is never coming", async () => {
    // If the tracker or the projection is down the row will not appear, and a
    // console left open must not poll all afternoon over it.
    getPoolVouchers.mockResolvedValue({ vouchers: [] });

    renderHook(() => usePoolVouchers(ADDRESS, { tokenAddress: RIBA, deadline: Date.now() - 1 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(getPoolVouchers).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getPoolVouchers).toHaveBeenCalledTimes(1);
  });
});

describe("hasVoucher", () => {
  it("matches regardless of address casing", () => {
    // The catalog stores EIP-55 and the sheet hands over whatever the picker had.
    expect(hasVoucher([voucher(RIBA.toUpperCase().replace("0X", "0x"))], RIBA)).toBe(true);
    expect(hasVoucher([], RIBA)).toBe(false);
  });
});
