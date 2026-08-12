import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MarketVoucherDetail } from "@clc/api/features/market/client";
import { voucherKeys } from "@clc/api/features/market/queries";
import { marketVoucherDetailQuery, useMarketVoucherDetail } from "./use-market-voucher-detail";

const getMarketVoucher = vi.hoisted(() => vi.fn());

vi.mock("@clc/api/features/market/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clc/api/features/market/client")>();
  return { ...actual, getMarketVoucher };
});

// The app-owned client is the seam the code now goes through. Build it from
// the already-mocked resource modules above so their overrides still apply.
vi.mock("#/lib/api", async () => ({
  clcApi: {
    market: await import("@clc/api/features/market/client"),
  },
}));

const CHECKSUMMED = "0xAbC0000000000000000000000000000000000123";

function detail(overrides: Partial<MarketVoucherDetail> = {}): MarketVoucherDetail {
  return {
    id: "2710",
    chainId: 42220,
    address: CHECKSUMMED,
    name: "Priscilah Malii",
    symbol: "MALII",
    decimals: 6,
    ownerAddress: null,
    description: null,
    voucherUoa: "KSH",
    voucherValue: "10",
    locationName: "C96, KEN",
    lat: -1.450979,
    lng: 38.235115,
    email: "issuer@example.org",
    website: null,
    phone: null,
    iconUrl: null,
    bannerUrl: null,
    kind: "goods",
    ...overrides,
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false },
    },
  });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  getMarketVoucher.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMarketVoucherDetail", () => {
  it("resolves the voucher for an address", async () => {
    getMarketVoucher.mockResolvedValue(detail());
    const client = newClient();

    const { result } = renderHook(() => useMarketVoucherDetail(CHECKSUMMED), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.data?.symbol).toBe("MALII"));
    expect(getMarketVoucher).toHaveBeenCalledWith(CHECKSUMMED, expect.anything());
  });

  // The card tap and the voucher page must land on one cache entry. Without
  // this, tapping a marker then opening it refetches and the page shows a
  // loading state for data the app already had.
  it("shares one cache entry across address casings", async () => {
    getMarketVoucher.mockResolvedValue(detail());
    const client = newClient();

    const card = renderHook(() => useMarketVoucherDetail(CHECKSUMMED), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(card.result.current.data).toBeDefined());

    // The route param is whatever casing the link carried.
    const page = renderHook(() => useMarketVoucherDetail(CHECKSUMMED.toLowerCase()), {
      wrapper: wrapper(client),
    });

    // Already resolved on first render: no fetch, no pending state.
    expect(page.result.current.data?.symbol).toBe("MALII");
    expect(page.result.current.isPending).toBe(false);
    expect(getMarketVoucher).toHaveBeenCalledTimes(1);
  });

  it("does not fetch without an address", () => {
    getMarketVoucher.mockResolvedValue(detail());

    const { result } = renderHook(() => useMarketVoucherDetail(undefined), {
      wrapper: wrapper(newClient()),
    });

    expect(getMarketVoucher).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("keys distinct vouchers separately", async () => {
    const other = "0x0000000000000000000000000000000000000456";
    getMarketVoucher.mockImplementation((address: string) =>
      Promise.resolve(detail({ address: address as MarketVoucherDetail["address"] })),
    );
    const client = newClient();

    const first = renderHook(() => useMarketVoucherDetail(CHECKSUMMED), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(first.result.current.data).toBeDefined());

    const second = renderHook(() => useMarketVoucherDetail(other), { wrapper: wrapper(client) });
    await waitFor(() => expect(second.result.current.data?.address).toBe(other));

    expect(getMarketVoucher).toHaveBeenCalledTimes(2);
  });

  // The catalog is a static bulk import; the one-minute global staleTime would
  // refetch every reopened card. See docs/TANSTACK_QUERY.md.
  it("keeps the catalog freshness policy rather than the global default", () => {
    const options = marketVoucherDetailQuery(CHECKSUMMED);

    expect(options.staleTime).toBe(10 * 60_000);
    expect(options.gcTime).toBe(30 * 60_000);
    // Asserted through the canonical factory, not a literal: the key belongs to
    // @clc/api, and duplicating its shape here would drift from it.
    expect(options.queryKey).toEqual(voucherKeys.detail(CHECKSUMMED));
  });
});
