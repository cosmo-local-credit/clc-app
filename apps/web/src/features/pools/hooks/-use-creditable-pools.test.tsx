import type { AccountToken } from "@clc/api/features/accounts/client";
import type { PoolVoucherFacet, UserPool } from "@clc/api/features/pools/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  holdings: {
    tokens: [] as AccountToken[],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  vocabulary: {
    data: { tagFacets: [], voucherFacets: [] as PoolVoucherFacet[] },
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  fetchCatalog: vi.fn(),
  getBlockNumber: vi.fn(),
  multicall: vi.fn(),
}));

vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountTokens: () => mocks.holdings,
}));

vi.mock("#/features/pools/hooks/use-filtered-pools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/features/pools/hooks/use-filtered-pools")>();
  return {
    ...actual,
    fetchFilteredPoolCatalog: (...args: unknown[]) => mocks.fetchCatalog(...args),
    usePoolFacetVocabulary: () => mocks.vocabulary,
  };
});

vi.mock("viem/actions", () => ({
  getBlockNumber: () => mocks.getBlockNumber(),
  multicall: (_client: unknown, args: unknown) => mocks.multicall(args),
}));

vi.mock("wagmi", () => ({ useClient: () => ({ uid: "credit-test-client" }) }));

import { useCreditablePools } from "./use-creditable-pools";

const HOLDER = "0x1000000000000000000000000000000000000000";
const POOL_ADDRESS = "0x2000000000000000000000000000000000000000" as const;
const REGISTRY = "0x3000000000000000000000000000000000000000" as const;
const LIMITER = "0x4000000000000000000000000000000000000000" as const;

function token(index: number): AccountToken {
  const address = `0x${(index + 10).toString(16).padStart(40, "0")}`;
  return {
    id: index,
    tokenAddress: address,
    tokenSymbol: `T${index}`,
    tokenName: `Token ${index}`,
    tokenDecimals: 6,
    balance: "5",
    iconUrl: null,
    lastDateBlock: "",
  };
}

function facet(accountToken: AccountToken): PoolVoucherFacet {
  return {
    chainId: 100,
    address: accountToken.tokenAddress as `0x${string}`,
    name: accountToken.tokenName,
    symbol: accountToken.tokenSymbol,
    count: 1,
  };
}

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "10",
    address: POOL_ADDRESS,
    tokenRegistryAddress: REGISTRY,
    limiterAddress: LIMITER,
    ...overrides,
  } as UserPool;
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function successfulReadResults(pairCount: number) {
  return Array.from({ length: pairCount }, (_, index) => {
    const held = index === pairCount - 1 ? 5n : 0n;
    return [held, 45n, true, 50n].map((result) => ({ status: "success", result }));
  }).flat();
}

beforeEach(() => {
  mocks.holdings.tokens = [];
  mocks.holdings.isPending = false;
  mocks.holdings.isError = false;
  mocks.holdings.isFetching = false;
  mocks.holdings.refetch.mockReset();
  mocks.vocabulary.data = { tagFacets: [], voucherFacets: [] };
  mocks.vocabulary.isError = false;
  mocks.vocabulary.isFetching = false;
  mocks.vocabulary.refetch.mockReset();
  mocks.fetchCatalog.mockReset();
  mocks.getBlockNumber.mockReset().mockResolvedValue(77n);
  mocks.multicall.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCreditablePools", () => {
  it("chunks every held voucher, deduplicates pools, and verifies one pinned block", async () => {
    mocks.holdings.tokens = Array.from({ length: 13 }, (_, index) => token(index));
    mocks.vocabulary.data = {
      tagFacets: [],
      voucherFacets: mocks.holdings.tokens.map(facet),
    };
    mocks.fetchCatalog.mockResolvedValue({
      pools: [pool()],
      tagFacets: null,
      voucherFacets: null,
    });
    mocks.multicall.mockResolvedValue(successfulReadResults(13));

    const { result } = renderHook(() => useCreditablePools(HOLDER), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(mocks.fetchCatalog).toHaveBeenCalledTimes(2);
    expect(
      mocks.fetchCatalog.mock.calls.map(([request]) => request.filter.vouchers.length),
    ).toEqual([12, 1]);
    expect(result.current.pools.map((entry) => entry.address)).toEqual([POOL_ADDRESS]);
    expect(mocks.getBlockNumber).toHaveBeenCalledOnce();
    expect(mocks.multicall).toHaveBeenCalledOnce();
    const [{ allowFailure, blockNumber, contracts }] = mocks.multicall.mock.calls[0] as [
      {
        allowFailure: boolean;
        blockNumber: bigint;
        contracts: Array<{ functionName: string }>;
      },
    ];
    expect(allowFailure).toBe(true);
    expect(blockNumber).toBe(77n);
    expect(contracts).toHaveLength(13 * 4);
    expect(contracts.slice(0, 4).map((contract) => contract.functionName)).toEqual([
      "balanceOf",
      "balanceOf",
      "have",
      "limitOf",
    ]);
  });

  it("bounds concurrent catalog requests while walking many voucher batches", async () => {
    mocks.holdings.tokens = Array.from({ length: 37 }, (_, index) => token(index));
    mocks.vocabulary.data = {
      tagFacets: [],
      voucherFacets: mocks.holdings.tokens.map(facet),
    };
    let active = 0;
    let maximumActive = 0;
    mocks.fetchCatalog.mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return { pools: [], tagFacets: null, voucherFacets: null };
    });

    const { result } = renderHook(() => useCreditablePools(HOLDER), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(mocks.fetchCatalog).toHaveBeenCalledTimes(4);
    expect(maximumActive).toBe(3);
    expect(mocks.multicall).not.toHaveBeenCalled();
  });

  it("does no chain read when no held voucher has a pool relationship", async () => {
    mocks.holdings.tokens = [token(1)];
    mocks.vocabulary.data = { tagFacets: [], voucherFacets: [] };

    const { result } = renderHook(() => useCreditablePools(HOLDER), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toEqual([]);
    expect(mocks.fetchCatalog).not.toHaveBeenCalled();
    expect(mocks.multicall).not.toHaveBeenCalled();
  });

  it("excludes an unreadable pair and reports the verification gap", async () => {
    const held = token(1);
    mocks.holdings.tokens = [held];
    mocks.vocabulary.data = { tagFacets: [], voucherFacets: [facet(held)] };
    mocks.fetchCatalog.mockResolvedValue({
      pools: [pool()],
      tagFacets: null,
      voucherFacets: null,
    });
    mocks.multicall.mockResolvedValue([
      { status: "success", result: 5n },
      { status: "success", result: 0n },
      { status: "failure" },
      { status: "success", result: 100n },
    ]);

    const { result } = renderHook(() => useCreditablePools(HOLDER), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toEqual([]);
    expect(result.current.hasVerificationGaps).toBe(true);
  });

  it("treats a pool without registry or limiter as uncapped", async () => {
    const held = token(1);
    mocks.holdings.tokens = [held];
    mocks.vocabulary.data = { tagFacets: [], voucherFacets: [facet(held)] };
    mocks.fetchCatalog.mockResolvedValue({
      pools: [pool({ tokenRegistryAddress: null, limiterAddress: null })],
      tagFacets: null,
      voucherFacets: null,
    });
    mocks.multicall.mockResolvedValue([
      { status: "success", result: 5n },
      { status: "failure" },
      { status: "failure" },
      { status: "failure" },
    ]);

    const { result } = renderHook(() => useCreditablePools(HOLDER), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pools).toHaveLength(1);
    expect(result.current.hasVerificationGaps).toBe(false);
  });
});
