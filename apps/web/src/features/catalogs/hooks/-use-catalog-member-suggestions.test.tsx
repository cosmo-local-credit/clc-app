import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AccountToken } from "@clc/api/features/accounts/client";
import type { UserPool } from "@clc/api/features/pools/client";
import {
  useCatalogPoolSuggestions,
  useCatalogVoucherSuggestions,
} from "./use-catalog-member-suggestions";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  address: `0x${"f".repeat(40)}`,
  getAccountTokens: vi.fn(),
  getLatestAccountTokens: vi.fn(),
  issued: {
    tokens: [] as AccountToken[],
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  ownedPools: {
    data: { pages: [] as Array<{ pools: UserPool[] }> },
    isError: false,
    isPending: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
  fetchFilteredPoolCatalog: vi.fn(),
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({
    isAuthenticated: mocks.authenticated,
    session: mocks.authenticated ? { address: mocks.address } : null,
  }),
}));
vi.mock("#/lib/api/accounts", () => ({
  accountsClient: {
    getAccountTokens: mocks.getAccountTokens,
    getLatestAccountTokens: mocks.getLatestAccountTokens,
  },
}));
vi.mock("#/features/wallet/hooks/use-account-balances", () => ({
  useAllAccountIssuedTokens: () => mocks.issued,
}));
vi.mock("#/features/pools/hooks/use-user-pools", () => ({
  useOwnedPoolsInfinite: () => mocks.ownedPools,
}));
vi.mock("#/features/pools/hooks/use-filtered-pools", () => ({
  fetchFilteredPoolCatalog: mocks.fetchFilteredPoolCatalog,
}));

const ADDRESS_A = `0x${"a".repeat(40)}`;
const ADDRESS_B = `0x${"b".repeat(40)}`;
const ADDRESS_C = `0x${"c".repeat(40)}`;

function token(
  id: number,
  address: string,
  balance: string,
  catalogActive: boolean | undefined = true,
): AccountToken {
  return {
    id,
    tokenAddress: address,
    tokenSymbol: `T${id}`,
    tokenName: `Token ${id}`,
    tokenDecimals: 6,
    balance,
    iconUrl: null,
    lastDateBlock: "1",
    ...(catalogActive === undefined ? {} : { catalogActive }),
  };
}

function pool(id: string, address: string, chainId: number | null = 100): UserPool {
  return {
    id,
    chainId,
    address: address as `0x${string}`,
    name: `Pool ${id}`,
    symbol: `P${id}`,
    imageUrl: null,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.getAccountTokens.mockResolvedValue({ tokens: [], last: undefined });
  mocks.getLatestAccountTokens.mockResolvedValue({ tokens: [] });
  mocks.issued.tokens = [];
  mocks.issued.isError = false;
  mocks.issued.isPending = false;
  mocks.issued.isFetching = false;
  mocks.ownedPools.data = { pages: [] };
  mocks.ownedPools.isError = false;
  mocks.ownedPools.isPending = false;
  mocks.ownedPools.isFetching = false;
  mocks.ownedPools.isFetchingNextPage = false;
  mocks.ownedPools.hasNextPage = false;
  mocks.fetchFilteredPoolCatalog.mockResolvedValue({
    pools: [],
    tagFacets: null,
    voucherFacets: null,
  });
});

describe("catalog member suggestions", () => {
  it("keeps all suggestion sources idle for guests", () => {
    mocks.authenticated = false;

    const vouchers = renderHook(() => useCatalogVoucherSuggestions(), { wrapper: wrapper() });
    const pools = renderHook(() => useCatalogPoolSuggestions(), { wrapper: wrapper() });

    expect(vouchers.result.current.holdings.status).toBe("idle");
    expect(vouchers.result.current.owned.status).toBe("idle");
    expect(pools.result.current.owned.status).toBe("idle");
    expect(pools.result.current.accepting.status).toBe("idle");
  });

  it("drains complete wallet pagination before exposing a later-page voucher", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      token(index + 1, `0x${(index + 1).toString(16).padStart(40, "0")}`, "10", false),
    );
    mocks.getAccountTokens.mockImplementation((params: { cursor?: number }) =>
      Promise.resolve(
        params.cursor === undefined
          ? { tokens: firstPage, last: 100 }
          : { tokens: [token(101, ADDRESS_A, "10")], last: 101 },
      ),
    );

    const { result } = renderHook(() => useCatalogVoucherSuggestions(), { wrapper: wrapper() });
    expect(result.current.holdings.status).toBe("loading");
    await waitFor(() => expect(result.current.holdings.status).toBe("ready"));

    expect(mocks.getAccountTokens).toHaveBeenCalledTimes(2);
    expect(result.current.holdings.rows.map((row) => row.id)).toEqual(["101"]);
  });

  it("keeps only positive active holdings and active owned vouchers", async () => {
    mocks.getAccountTokens.mockResolvedValue({
      tokens: [
        token(1, ADDRESS_A, "10"),
        token(2, ADDRESS_B, "0"),
        token(3, ADDRESS_C, "10", false),
        token(4, `0x${"d".repeat(40)}`, "invalid"),
      ],
    });
    mocks.issued.tokens = [token(2, ADDRESS_B, "0"), token(3, ADDRESS_C, "0", false)];

    const { result } = renderHook(() => useCatalogVoucherSuggestions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdings.status).toBe("ready"));

    expect(result.current.holdings.rows.map((row) => row.id)).toEqual(["1"]);
    expect(result.current.owned.rows.map((row) => row.id)).toEqual(["2"]);
  });

  it("falls back to recent holdings and marks the source partial", async () => {
    mocks.getAccountTokens.mockRejectedValue(new Error("offline"));
    mocks.getLatestAccountTokens.mockResolvedValue({ tokens: [token(1, ADDRESS_A, "10")] });

    const { result } = renderHook(() => useCatalogVoucherSuggestions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdings.status).toBe("ready"));

    expect(result.current.holdings.completeness).toBe("partial");
    expect(result.current.holdings.rows.map((row) => row.address)).toEqual([ADDRESS_A]);
    expect(result.current.owned.status).toBe("ready");
  });

  it("reports wallet suggestions unavailable only after both balance reads fail", async () => {
    mocks.getAccountTokens.mockRejectedValue(new Error("complete offline"));
    mocks.getLatestAccountTokens.mockRejectedValue(new Error("recent offline"));

    const { result } = renderHook(() => useCatalogVoucherSuggestions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdings.status).toBe("error"));

    expect(result.current.holdings.rows).toEqual([]);
    expect(result.current.owned.status).toBe("ready");

    const completeCalls = mocks.getAccountTokens.mock.calls.length;
    const recentCalls = mocks.getLatestAccountTokens.mock.calls.length;
    act(() => result.current.holdings.retry());
    await waitFor(() =>
      expect(mocks.getAccountTokens.mock.calls.length).toBeGreaterThan(completeCalls),
    );
    await waitFor(() =>
      expect(mocks.getLatestAccountTokens.mock.calls.length).toBeGreaterThan(recentCalls),
    );
  });

  it("exposes retries for complete holdings and owned-voucher discovery", async () => {
    const { result } = renderHook(() => useCatalogVoucherSuggestions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.holdings.status).toBe("ready"));

    act(() => {
      result.current.holdings.retry();
      result.current.owned.retry();
    });

    expect(mocks.issued.refetch).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.getAccountTokens).toHaveBeenCalledTimes(2));
  });

  it("suggests owned pools before globally matched pools that accept wallet vouchers", async () => {
    mocks.getAccountTokens.mockResolvedValue({ tokens: [token(1, ADDRESS_A, "10")] });
    mocks.ownedPools.data = {
      pages: [{ pools: [pool("10", ADDRESS_B), pool("11", ADDRESS_C, null)] }],
    };
    mocks.fetchFilteredPoolCatalog.mockResolvedValue({
      pools: [pool("12", ADDRESS_C)],
      tagFacets: null,
      voucherFacets: null,
    });

    const { result } = renderHook(() => useCatalogPoolSuggestions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.accepting.status).toBe("ready"));

    expect(result.current.owned.rows.map((row) => row.id)).toEqual(["10"]);
    expect(result.current.accepting.rows.map((row) => row.id)).toEqual(["12"]);
    expect(mocks.fetchFilteredPoolCatalog).toHaveBeenCalledWith({
      filter: {
        term: "",
        tags: [],
        tagMatch: "any",
        vouchers: [{ chainId: 100, address: ADDRESS_A }],
        voucherMatch: "any",
      },
      signal: expect.any(AbortSignal),
      nearby: false,
    });
  });

  it("preserves owned pools when relationship discovery fails", async () => {
    mocks.getAccountTokens.mockResolvedValue({ tokens: [token(1, ADDRESS_A, "10")] });
    mocks.ownedPools.data = { pages: [{ pools: [pool("10", ADDRESS_B)] }] };
    mocks.fetchFilteredPoolCatalog.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useCatalogPoolSuggestions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.accepting.status).toBe("error"));

    expect(result.current.owned.status).toBe("ready");
    expect(result.current.owned.rows.map((row) => row.id)).toEqual(["10"]);
    expect(result.current.accepting.rows).toEqual([]);
  });

  it("drains owned pool pages and exposes its retry action", async () => {
    mocks.ownedPools.hasNextPage = true;

    const { result } = renderHook(() => useCatalogPoolSuggestions(), { wrapper: wrapper() });

    await waitFor(() => expect(mocks.ownedPools.fetchNextPage).toHaveBeenCalledOnce());
    expect(result.current.owned.status).toBe("loading");
    act(() => result.current.owned.retry());
    expect(mocks.ownedPools.refetch).toHaveBeenCalledOnce();
  });

  it("batches many held vouchers and deduplicates accepting pools", async () => {
    const held = Array.from({ length: 101 }, (_, index) =>
      token(index + 1, `0x${(index + 1).toString(16).padStart(40, "0")}`, "1"),
    );
    mocks.getAccountTokens.mockResolvedValue({ tokens: held });
    const matching = pool("12", ADDRESS_C);
    mocks.fetchFilteredPoolCatalog.mockResolvedValue({
      pools: [matching],
      tagFacets: null,
      voucherFacets: null,
    });

    const { result } = renderHook(() => useCatalogPoolSuggestions(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.accepting.status).toBe("ready"));

    expect(mocks.fetchFilteredPoolCatalog).toHaveBeenCalledTimes(11);
    expect(result.current.accepting.rows.map((row) => row.id)).toEqual(["12"]);
  });
});
