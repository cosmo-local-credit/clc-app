import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const getFilteredMarketVouchers = vi.hoisted(() => vi.fn());
const getAccountTokens = vi.hoisted(() => vi.fn());
const getLatestAccountTokens = vi.hoisted(() => vi.fn());
const connection = vi.hoisted(() => ({ address: undefined as string | undefined }));

vi.mock("#/lib/api/market", () => ({
  marketClient: { getFilteredMarketVouchers },
}));

vi.mock("#/lib/api/accounts", () => ({
  accountsClient: { getAccountTokens, getLatestAccountTokens },
}));

vi.mock("wagmi", () => ({
  useConnection: () => connection,
}));

import { useApprovalSuggestions } from "./use-approval-suggestions";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";
const POOL = "0x2b4e18f7329bb8b533e5be0d8b176ee1ed73563d";

function token(address: string, symbol: string, id = 2) {
  return {
    id,
    tokenAddress: address,
    tokenSymbol: symbol,
    tokenName: symbol,
    tokenDecimals: 6,
    balance: "1",
    iconUrl: null,
    lastDateBlock: "2026-01-01T00:00:00Z",
  };
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  connection.address = undefined;
  getFilteredMarketVouchers.mockReset();
  getAccountTokens.mockReset();
  getLatestAccountTokens.mockReset();
});

describe("useApprovalSuggestions", () => {
  it("does not ask for personal vouchers with no wallet", () => {
    const { result } = renderHook(() => useApprovalSuggestions(undefined), {
      wrapper: wrapper(client()),
    });

    expect(result.current.issued.status).toBe("idle");
    expect(result.current.holdings.status).toBe("idle");
    expect(getFilteredMarketVouchers).not.toHaveBeenCalled();
    expect(getAccountTokens).not.toHaveBeenCalled();
  });

  it("reads complete wallet holdings, pool deposits, and issued vouchers", async () => {
    connection.address = ADDRESS;
    getFilteredMarketVouchers.mockResolvedValue({
      vouchers: [
        {
          id: "1",
          chainId: 100,
          address: "0xaaa0000000000000000000000000000000000001",
          name: "Will",
          symbol: "WLLR",
          iconUrl: null,
          locationName: null,
          lat: 0,
          lng: 0,
          kind: "voucher",
        },
      ],
      first: 1,
      last: 1,
      receivedCount: 1,
      tagFacets: null,
    });
    getAccountTokens.mockImplementation(({ address }: { address: string }) =>
      Promise.resolve({
        tokens:
          address === ADDRESS.toLowerCase()
            ? [token("0xbbb0000000000000000000000000000000000002", "SRF")]
            : [token("0xccc0000000000000000000000000000000000003", "PEPAS", 3)],
      }),
    );

    const { result } = renderHook(() => useApprovalSuggestions(POOL), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => expect(result.current.issued.status).toBe("ready"));
    expect(result.current.holdings.status).toBe("ready");
    expect(result.current.deposited.status).toBe("ready");
    expect(result.current.issued.rows.map((row) => row.symbol)).toEqual(["WLLR"]);
    expect(result.current.holdings.rows.map((row) => row.symbol)).toEqual(["SRF"]);
    expect(result.current.deposited.rows.map((row) => row.symbol)).toEqual(["PEPAS"]);
    expect(result.current.holdings.completeness).toBe("complete");
    expect(getFilteredMarketVouchers).toHaveBeenCalledWith(
      expect.objectContaining({
        perPage: 20,
        owner: ADDRESS.toLowerCase(),
        filter: expect.objectContaining({ term: "" }),
      }),
      expect.any(AbortSignal),
    );
    expect(getAccountTokens).toHaveBeenCalledWith({
      address: ADDRESS.toLowerCase(),
      perPage: 100,
      cursor: undefined,
      next: undefined,
    });
    expect(getAccountTokens).toHaveBeenCalledWith({
      address: POOL.toLowerCase(),
      perPage: 100,
      cursor: undefined,
      next: undefined,
    });
    expect(getLatestAccountTokens).not.toHaveBeenCalled();
  });

  it("does not suggest zero or malformed account balances", async () => {
    connection.address = ADDRESS;
    getFilteredMarketVouchers.mockResolvedValue({ vouchers: [], receivedCount: 0 });
    getAccountTokens.mockImplementation(({ address }: { address: string }) =>
      Promise.resolve({
        tokens:
          address === ADDRESS.toLowerCase()
            ? [
                token("0xbbb0000000000000000000000000000000000002", "HELD"),
                { ...token("0xbbb0000000000000000000000000000000000003", "EMPTY"), balance: "0" },
              ]
            : [
                token("0xccc0000000000000000000000000000000000003", "DEPOSITED", 3),
                { ...token("0xccc0000000000000000000000000000000000004", "BAD", 4), balance: "?" },
              ],
      }),
    );

    const { result } = renderHook(() => useApprovalSuggestions(POOL), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => expect(result.current.holdings.status).toBe("ready"));
    expect(result.current.holdings.rows.map((row) => row.symbol)).toEqual(["HELD"]);
    expect(result.current.deposited.rows.map((row) => row.symbol)).toEqual(["DEPOSITED"]);
  });

  it("falls back to recent holdings without hiding successful sources", async () => {
    connection.address = ADDRESS;
    getFilteredMarketVouchers.mockResolvedValue({
      vouchers: [
        {
          id: "1",
          chainId: 100,
          address: "0xaaa0000000000000000000000000000000000001",
          name: "Will",
          symbol: "WLLR",
          iconUrl: null,
          locationName: null,
          lat: 0,
          lng: 0,
          kind: "voucher",
        },
      ],
      first: 1,
      last: 1,
      receivedCount: 1,
      tagFacets: null,
    });
    getAccountTokens.mockImplementation(({ address }: { address: string }) =>
      address === ADDRESS.toLowerCase()
        ? Promise.reject(new Error("federation unavailable"))
        : Promise.resolve({ tokens: [] }),
    );
    getLatestAccountTokens.mockResolvedValue({
      tokens: [token("0xbbb0000000000000000000000000000000000002", "SRF")],
    });

    const { result } = renderHook(() => useApprovalSuggestions(POOL), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => expect(result.current.holdings.status).toBe("ready"));
    expect(result.current.issued.status).toBe("ready");
    expect(result.current.issued.rows.map((row) => row.symbol)).toEqual(["WLLR"]);
    expect(result.current.holdings.rows.map((row) => row.symbol)).toEqual(["SRF"]);
    expect(result.current.holdings.completeness).toBe("partial");
    expect(getLatestAccountTokens).toHaveBeenCalledWith(ADDRESS.toLowerCase());

    await act(async () => {
      result.current.holdings.retry();
    });
    await waitFor(() =>
      expect(
        getAccountTokens.mock.calls.filter(([params]) => params.address === ADDRESS.toLowerCase()),
      ).toHaveLength(2),
    );
    expect(getFilteredMarketVouchers).toHaveBeenCalledTimes(1);
  });

  it("drains later account pages before reporting complete holdings", async () => {
    connection.address = ADDRESS;
    getFilteredMarketVouchers.mockResolvedValue({ vouchers: [], receivedCount: 0 });
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      token(`0x${(index + 1).toString(16).padStart(40, "0")}`, `T${index + 1}`, index + 1),
    );
    const later = token("0xffff000000000000000000000000000000000001", "LATE", 101);
    getAccountTokens.mockImplementation(
      ({ address, cursor }: { address: string; cursor?: number }) => {
        if (address === POOL.toLowerCase()) return Promise.resolve({ tokens: [] });
        if (cursor === undefined) {
          return Promise.resolve({ tokens: firstPage, first: 1, last: 100 });
        }
        return Promise.resolve({ tokens: [later], first: 101, last: 101 });
      },
    );

    const { result } = renderHook(() => useApprovalSuggestions(POOL), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => expect(result.current.holdings.status).toBe("ready"));
    expect(result.current.holdings.rows).toHaveLength(101);
    expect(result.current.holdings.rows.at(-1)?.symbol).toBe("LATE");
    expect(getAccountTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ADDRESS.toLowerCase(),
        cursor: 100,
        next: true,
      }),
    );
  });

  it("reports unavailable only when complete and recent holdings both fail", async () => {
    connection.address = ADDRESS;
    getFilteredMarketVouchers.mockResolvedValue({ vouchers: [], receivedCount: 0 });
    getAccountTokens.mockImplementation(({ address }: { address: string }) =>
      address === ADDRESS.toLowerCase()
        ? Promise.reject(new Error("complete failed"))
        : Promise.resolve({ tokens: [] }),
    );
    getLatestAccountTokens.mockRejectedValue(new Error("recent failed"));

    const { result } = renderHook(() => useApprovalSuggestions(POOL), {
      wrapper: wrapper(client()),
    });

    await waitFor(() => expect(result.current.holdings.status).toBe("error"));
    expect(result.current.holdings.rows).toEqual([]);
    expect(result.current.holdings.completeness).toBe("partial");
    expect(result.current.deposited.status).toBe("ready");
  });
});
