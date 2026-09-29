import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const getFilteredMarketVouchers = vi.hoisted(() => vi.fn());
const getAccountTokens = vi.hoisted(() => vi.fn());
const connection = vi.hoisted(() => ({ address: undefined as string | undefined }));

vi.mock("#/lib/api/market", () => ({
  marketClient: { getFilteredMarketVouchers },
}));

vi.mock("#/lib/api/accounts", () => ({
  accountsClient: { getAccountTokens },
}));

vi.mock("wagmi", () => ({
  useConnection: () => connection,
}));

import { useApprovalSuggestions } from "./use-approval-suggestions";

const ADDRESS = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

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
});

describe("useApprovalSuggestions", () => {
  it("does not ask for personal vouchers with no wallet", () => {
    const { result } = renderHook(() => useApprovalSuggestions(), { wrapper: wrapper(client()) });

    expect(result.current.isPending).toBe(false);
    expect(getFilteredMarketVouchers).not.toHaveBeenCalled();
    expect(getAccountTokens).not.toHaveBeenCalled();
  });

  it("reads vouchers this wallet issued and vouchers it holds", async () => {
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
    getAccountTokens.mockResolvedValue({
      tokens: [
        {
          id: 2,
          tokenAddress: "0xbbb0000000000000000000000000000000000002",
          tokenSymbol: "SRF",
          tokenName: "Sarafu",
          tokenDecimals: 6,
          balance: "1",
          iconUrl: null,
          lastDateBlock: "2026-01-01T00:00:00Z",
        },
      ],
    });

    const { result } = renderHook(() => useApprovalSuggestions(), { wrapper: wrapper(client()) });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.issued.map((row) => row.symbol)).toEqual(["WLLR"]);
    expect(result.current.holdings.map((row) => row.symbol)).toEqual(["SRF"]);
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
      perPage: 20,
    });
  });
});
