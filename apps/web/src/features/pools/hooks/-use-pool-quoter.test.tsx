import type { UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { multicallMock } = vi.hoisted(() => ({ multicallMock: vi.fn() }));

vi.mock("viem/actions", () => ({
  multicall: (_client: unknown, args: unknown) => multicallMock(args),
  readContract: vi.fn(),
}));

vi.mock("wagmi", () => ({ useClient: () => ({ uid: "test-client" }) }));

import { usePoolVoucherRatesByAddress } from "./use-pool-quoter";

const QUOTER = "0xb91c000000000000000000000000000000007d20" as const;
const FIRST = "0x1111000000000000000000000000000000000001" as const;
const SECOND = "0x2222000000000000000000000000000000000002" as const;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function pool(): UserPool {
  return {
    id: "1",
    chainId: 100,
    address: "0x3333000000000000000000000000000000000003",
    name: "Test pool",
    symbol: "TEST",
    ownerAddress: "0x4444000000000000000000000000000000000004",
    feePpm: 0,
    feeAddress: null,
    tokenRegistryAddress: "0x5555000000000000000000000000000000000005",
    limiterAddress: null,
    quoterAddress: QUOTER,
    quoterType: "relative",
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "",
    unitOfAccount: "KES",
    locationName: null,
    geoLat: null,
    geoLng: null,
    email: null,
    website: null,
    phone: null,
    imageUrl: null,
    bannerUrl: null,
    terms: null,
    defaultVoucherId: null,
    voucherCount: 0,
    tags: [],
  };
}

beforeEach(() => {
  multicallMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  multicallMock.mockReset();
});

describe("usePoolVoucherRatesByAddress", () => {
  it("deduplicates arbitrary voucher addresses and normalizes an unset rate to parity", async () => {
    multicallMock.mockResolvedValue([
      { status: "success", result: 0n },
      { status: "success", result: 2_500_000n },
    ]);

    const { result } = renderHook(
      () => usePoolVoucherRatesByAddress(pool(), [SECOND, FIRST, SECOND], true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(multicallMock).toHaveBeenCalledOnce();
    const [[{ allowFailure, contracts }]] = multicallMock.mock.calls as Array<
      [
        {
          allowFailure: boolean;
          contracts: Array<{ address: string; functionName: string; args: unknown[] }>;
        },
      ]
    >;
    expect(allowFailure).toBe(true);
    expect(contracts.map((contract) => contract.args[0])).toEqual([FIRST, SECOND]);
    expect(result.current.data).toEqual(
      new Map([
        [FIRST, 1_000_000n],
        [SECOND, 2_500_000n],
      ]),
    );
  });

  it("does not read without a selected address", async () => {
    renderHook(() => usePoolVoucherRatesByAddress(pool(), [], true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(multicallMock).not.toHaveBeenCalled());
  });

  it("keeps configuration blocked when a selected voucher's rate cannot be read", async () => {
    multicallMock.mockResolvedValue([{ status: "failure", error: new Error("quoter reverted") }]);

    const { result } = renderHook(
      () =>
        usePoolVoucherRatesByAddress(pool(), [FIRST], true, {
          failOnReadError: true,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
