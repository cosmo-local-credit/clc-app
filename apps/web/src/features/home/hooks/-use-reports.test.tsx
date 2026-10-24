import type { VoucherRef } from "@clc/core/features/catalog/logic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { FilteredReportPage, ReportSummary } from "@clc/api/features/reports/client";
import { useVoucherReportsInfinite } from "./use-reports";

const getFilteredReports = vi.hoisted(() => vi.fn());

vi.mock("#/lib/api/reports", () => ({
  reportsClient: {
    getFilteredReports: (...args: unknown[]) => getFilteredReports(...args),
  },
}));

vi.mock("#/lib/geo-client", () => ({
  reverseLocation: vi.fn(),
}));

const VOUCHER: VoucherRef = {
  chainId: 42220,
  address: "0xAbC0000000000000000000000000000000000123",
};

function report(id: number): ReportSummary {
  return {
    id: String(id),
    title: `Report ${id}`,
    description: "",
    imageUrl: null,
    locationName: null,
    lat: null,
    lng: null,
    periodFrom: null,
    periodTo: null,
    createdAt: null,
    updatedAt: `2026-08-${String(id).padStart(2, "0")}T00:00:00Z`,
    tags: [],
    vouchers: [],
    pools: [],
  };
}

function page(ids: number[], next: FilteredReportPage["next"]): FilteredReportPage {
  return {
    reports: ids.map(report),
    next,
    tagFacets: null,
    voucherFacets: null,
    poolFacets: null,
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  getFilteredReports.mockReset();
});

describe("useVoucherReportsInfinite", () => {
  it("filters by one canonical voucher and follows report cursors", async () => {
    const next = { updatedAt: "2026-08-02T00:00:00Z", id: "2" };
    getFilteredReports
      .mockResolvedValueOnce(page([3, 2], next))
      .mockResolvedValueOnce(page([1], null));

    const { result } = renderHook(() => useVoucherReportsInfinite(VOUCHER, 2), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getFilteredReports).toHaveBeenNthCalledWith(
      1,
      {
        perPage: 2,
        cursor: undefined,
        filter: {
          term: "",
          tags: [],
          tagMatch: "any",
          vouchers: [{ ...VOUCHER, address: VOUCHER.address.toLowerCase() }],
          voucherMatch: "any",
          pools: [],
          poolMatch: "any",
        },
      },
      expect.anything(),
    );

    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(getFilteredReports).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ perPage: 2, cursor: next }),
      expect.anything(),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it("does not request reports without a voucher or when access is disabled", () => {
    const client = newClient();
    const missing = renderHook(() => useVoucherReportsInfinite(undefined), {
      wrapper: wrapper(client),
    });
    const disabled = renderHook(() => useVoucherReportsInfinite(VOUCHER, 20, false), {
      wrapper: wrapper(client),
    });

    expect(missing.result.current.fetchStatus).toBe("idle");
    expect(disabled.result.current.fetchStatus).toBe("idle");
    expect(getFilteredReports).not.toHaveBeenCalled();
  });

  it("shares one cache entry across address casing", async () => {
    getFilteredReports.mockResolvedValue(page([1], null));
    const client = newClient();
    const first = renderHook(() => useVoucherReportsInfinite(VOUCHER), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(first.result.current.data).toBeDefined());

    const second = renderHook(
      () =>
        useVoucherReportsInfinite({
          ...VOUCHER,
          address: VOUCHER.address.toLowerCase() as VoucherRef["address"],
        }),
      { wrapper: wrapper(client) },
    );

    expect(second.result.current.data?.pages[0]?.reports[0]?.id).toBe("1");
    expect(second.result.current.isPending).toBe(false);
    expect(getFilteredReports).toHaveBeenCalledTimes(1);
  });
});
