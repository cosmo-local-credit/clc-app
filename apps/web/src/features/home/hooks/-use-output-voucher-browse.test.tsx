import type { UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const VOUCHER = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";

const mocks = vi.hoisted(() => ({
  availability: {
    pools: [] as unknown[],
    status: "ready" as "idle" | "loading" | "ready" | "error",
    isRefreshing: false,
    hasVerificationGaps: false,
    retry: vi.fn(),
    retrying: false,
  },
  requested: [] as unknown[],
  voucher: vi.fn(),
}));

vi.mock("#/features/pools/hooks/use-pool-output-availability", () => ({
  usePoolOutputAvailability: (voucher: unknown) => {
    mocks.requested.push(voucher);
    return voucher === undefined
      ? { ...mocks.availability, pools: [], status: "idle" }
      : mocks.availability;
  },
}));
vi.mock("#/lib/api/market", () => ({
  marketClient: { getMarketVoucher: (...args: unknown[]) => mocks.voucher(...args) },
}));

import { useOutputVoucherBrowse } from "./use-output-voucher-browse";

function pool(index: number): UserPool {
  return {
    address: `0x${index.toString(16).padStart(40, "0")}`,
    chainId: 100,
  } as UserPool;
}
const ref = (index: number) => ({ chainId: 100, address: pool(index).address });

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const NO_CREDIT = { enabled: false, poolRefs: undefined };

beforeEach(() => {
  mocks.availability.pools = [pool(1), pool(2), pool(3)];
  mocks.availability.status = "ready";
  mocks.availability.hasVerificationGaps = false;
  mocks.requested.length = 0;
  mocks.voucher.mockReset();
  mocks.voucher.mockResolvedValue({ address: VOUCHER, symbol: "BAKE", name: "Bakery voucher" });
});

describe("useOutputVoucherBrowse", () => {
  it("leaves discovery alone when the link names no output", () => {
    const { result } = renderHook(() => useOutputVoucherBrowse(undefined, NO_CREDIT), { wrapper });
    expect(result.current.state).toBe("off");
    expect(result.current.active).toBe(false);
    expect(result.current.poolRefs).toBeUndefined();
    expect(result.current.blocksResults).toBe(false);
    expect(mocks.requested.every((voucher) => voucher === undefined)).toBe(true);
  });

  it("sends the pools that can provide the voucher, and the real symbol once known", async () => {
    const { result } = renderHook(() => useOutputVoucherBrowse(VOUCHER, NO_CREDIT), { wrapper });
    expect(result.current.address).toBe(VOUCHER);
    expect(result.current.state).toBe("ready");
    expect(result.current.poolRefs).toEqual([ref(1), ref(2), ref(3)]);
    expect(result.current.blocksResults).toBe(false);
    expect(result.current.symbol).toBeNull();
    await waitFor(() => expect(result.current.symbol).toBe("BAKE"));
  });

  it("intersects the output's pools with Credit's rather than replacing either", () => {
    const { result } = renderHook(
      () => useOutputVoucherBrowse(VOUCHER, { enabled: true, poolRefs: [ref(2), ref(9)] }),
      { wrapper },
    );
    expect(result.current.poolRefs).toEqual([ref(2)]);
    expect(result.current.isEmpty).toBe(false);
  });

  it("reports an empty intersection as no pool left, and blocks the request instead of broadening it", () => {
    const { result } = renderHook(
      () => useOutputVoucherBrowse(VOUCHER, { enabled: true, poolRefs: [ref(9)] }),
      { wrapper },
    );
    expect(result.current.poolRefs).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.blocksResults).toBe(true);
  });

  it("treats a checked voucher no pool can pay out as its own empty state, not an error", () => {
    mocks.availability.pools = [];
    const { result } = renderHook(() => useOutputVoucherBrowse(VOUCHER, NO_CREDIT), { wrapper });
    expect(result.current.state).toBe("ready");
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.blocksResults).toBe(true);
  });

  it.each(["loading", "error"] as const)("blocks results while the check is %s", (status) => {
    mocks.availability.status = status;
    mocks.availability.pools = [];
    const { result } = renderHook(() => useOutputVoucherBrowse(VOUCHER, NO_CREDIT), { wrapper });
    expect(result.current.state).toBe(status);
    expect(result.current.blocksResults).toBe(true);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.poolRefs).toBeUndefined();
  });

  it.each([["not-an-address"], [["0x1", "0x2"]]])(
    "gives an invalid output link its own state and never checks it (%j)",
    (value) => {
      const { result } = renderHook(() => useOutputVoucherBrowse(value, NO_CREDIT), { wrapper });
      expect(result.current.state).toBe("invalid");
      expect(result.current.invalid).toBe(true);
      expect(result.current.blocksResults).toBe(true);
      expect(mocks.requested.every((voucher) => voucher === undefined)).toBe(true);
    },
  );
});
