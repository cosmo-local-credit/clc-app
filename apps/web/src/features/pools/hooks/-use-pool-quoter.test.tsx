import type { UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { multicallMock, readContractMock } = vi.hoisted(() => ({
  multicallMock: vi.fn(),
  readContractMock: vi.fn(),
}));

vi.mock("viem/actions", () => ({
  multicall: (_client: unknown, args: unknown) => multicallMock(args),
  readContract: (_client: unknown, args: unknown) => readContractMock(args),
}));

vi.mock("wagmi", () => ({ useClient: () => ({ uid: "test-client" }) }));

const { listFeedsMock } = vi.hoisted(() => ({ listFeedsMock: vi.fn() }));
vi.mock("#/lib/api/oracle-feeds", () => ({
  oracleFeedsClient: { listOracleFeeds: listFeedsMock },
}));

import type { PoolVoucher } from "@clc/api/features/pools/client";
import {
  useOracleFeedRounds,
  usePoolQuoterKind,
  usePoolVoucherFeedStatuses,
  usePoolVoucherOracles,
  usePoolVoucherRatesByAddress,
} from "./use-pool-quoter";

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
  readContractMock.mockReset();
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

describe("usePoolQuoterKind", () => {
  const unrecorded = () => ({ ...pool(), quoterType: null });

  it("recognises an OracleQuoter by baseCurrency when priceIndex reverts", async () => {
    readContractMock.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "priceIndex") throw new Error("reverted");
      return "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0";
    });

    const { result } = renderHook(() => usePoolQuoterKind(unrecorded()), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.kind).toBe("oracle"));
  });

  it("still answers relative first, and unknown when neither selector answers", async () => {
    readContractMock.mockResolvedValue(0n);
    const relative = renderHook(() => usePoolQuoterKind(unrecorded()), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(relative.result.current.kind).toBe("relative"));

    readContractMock.mockRejectedValue(new Error("reverted"));
    const unknown = renderHook(() => usePoolQuoterKind(unrecorded()), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(unknown.result.current.isPending).toBe(false));
    expect(unknown.result.current.kind).toBe("unknown");
  });
});

describe("usePoolVoucherOracles", () => {
  it("reads each voucher's aggregator and bound, checksummed, with zero as no feed", async () => {
    multicallMock.mockResolvedValue([
      { status: "success", result: 86_400n },
      { status: "success", result: "0xab70bcb260073d036d1660201e9d5405f5829b7a" },
      { status: "success", result: 93_600n },
      { status: "success", result: "0x0000000000000000000000000000000000000000" },
      { status: "success", result: 0n },
    ]);

    const { result } = renderHook(() => usePoolVoucherOracles(pool(), [SECOND, FIRST], true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    const [[{ contracts }]] = multicallMock.mock.calls as Array<
      [{ contracts: Array<{ functionName: string; args?: unknown[] }> }]
    >;
    expect(contracts.map((contract) => [contract.functionName, contract.args?.[0]])).toEqual([
      ["maxStaleness", undefined],
      ["oracles", FIRST],
      ["oracleMaxStaleness", FIRST],
      ["oracles", SECOND],
      ["oracleMaxStaleness", SECOND],
    ]);
    expect(result.current.data).toEqual(
      new Map([
        [
          FIRST,
          {
            aggregatorAddress: "0xab70BCB260073d036d1660201e9d5405F5829b7a",
            maxStalenessSeconds: 93_600n,
            globalMaxStalenessSeconds: 86_400n,
          },
        ],
        [
          SECOND,
          { aggregatorAddress: null, maxStalenessSeconds: 0n, globalMaxStalenessSeconds: 86_400n },
        ],
      ]),
    );
  });

  it("fails rather than reading an unread mapping as no feed", async () => {
    multicallMock.mockResolvedValue([
      { status: "success", result: 86_400n },
      { status: "failure", error: new Error("reverted") },
      { status: "success", result: 0n },
    ]);

    const { result } = renderHook(() => usePoolVoucherOracles(pool(), [FIRST], true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useOracleFeedRounds", () => {
  const EUR = "0xab70BCB260073d036d1660201e9d5405F5829b7a" as const;
  const OTHER = "0x26C31ac71010aF62E6B486D1132E266D6298857D" as const;

  it("prices each feed on its own, marking stale and unreadable ones", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Reads run in address order: OTHER (0x26…) before EUR (0xab…).
    multicallMock.mockResolvedValue([
      { status: "failure", error: new Error("reverted") },
      { status: "success", result: 8 },
      { status: "success", result: [1n, 110_815_500n, 0n, BigInt(now - 90_000), 1n] },
      { status: "success", result: 8 },
    ]);

    const { result } = renderHook(
      () =>
        useOracleFeedRounds(
          [
            { address: EUR, maxStalenessSeconds: null },
            { address: OTHER, maxStalenessSeconds: null },
          ],
          true,
        ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.get(EUR)).toEqual({
      status: "ready",
      price: "1.1081",
      stale: true,
    });
    expect(result.current.data?.get(OTHER)).toEqual({ status: "unreadable" });
  });

  it("applies a feed's own freshness bound", async () => {
    const now = Math.floor(Date.now() / 1000);
    multicallMock.mockResolvedValue([
      { status: "success", result: [1n, 110_815_500n, 0n, BigInt(now - 90_000), 1n] },
      { status: "success", result: 8 },
    ]);

    const { result } = renderHook(
      () => useOracleFeedRounds([{ address: EUR, maxStalenessSeconds: 93_600 }], true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.get(EUR)).toEqual({
      status: "ready",
      price: "1.1081",
      stale: false,
    });
  });
});

describe("usePoolVoucherFeedStatuses", () => {
  const EUR = "0xab70BCB260073d036d1660201e9d5405F5829b7a" as const;
  const UNREGISTERED = "0x26C31ac71010aF62E6B486D1132E266D6298857D" as const;
  const voucher = (tokenAddress: string, overrides: Partial<PoolVoucher>) =>
    ({
      tokenAddress,
      oracleFeedId: null,
      oracleName: null,
      oracleAddress: null,
      ...overrides,
    }) as PoolVoucher;

  it("is null on a pool that is not oracle-priced", () => {
    const { result } = renderHook(() => usePoolVoucherFeedStatuses(pool(), []), {
      wrapper: createWrapper(),
    });
    expect(result.current).toBeNull();
    expect(listFeedsMock).not.toHaveBeenCalled();
  });

  it("names the registry pair, an unregistered aggregator, and a voucher with no feed", async () => {
    listFeedsMock.mockResolvedValue([
      {
        id: "7",
        chainId: 100,
        name: "EUR",
        address: EUR,
        description: "EUR / USD",
        decimals: 8,
        maxStalenessSeconds: 93_600,
      },
    ]);
    const vouchers = [
      voucher(FIRST, { oracleFeedId: "7", oracleName: "EUR", oracleAddress: EUR }),
      voucher(SECOND, { oracleAddress: UNREGISTERED }),
      voucher(QUOTER, {}),
    ];

    const { result } = renderHook(
      () => usePoolVoucherFeedStatuses({ ...pool(), quoterType: "oracle" }, vouchers),
      { wrapper: createWrapper() },
    );

    // The catalog's name stands in until the registry answers with the pair.
    expect(result.current?.get(FIRST)).toEqual({ kind: "verified", label: "EUR" });
    await waitFor(() =>
      expect(result.current?.get(FIRST)).toEqual({ kind: "verified", label: "EUR / USD" }),
    );
    expect(result.current?.get(SECOND)).toEqual({ kind: "unverified", address: UNREGISTERED });
    expect(result.current?.get(QUOTER)).toEqual({ kind: "none" });
  });
});
