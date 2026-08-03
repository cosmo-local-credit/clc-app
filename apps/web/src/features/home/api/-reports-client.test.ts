import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getFilteredReports } from "./reports-client";

const EMPTY_FILTER: CatalogFilter = {
  term: "",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
};

function mockFetch(result: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "",
    text: () => Promise.resolve(JSON.stringify({ ok: true, result })),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getFilteredReports", () => {
  it("serializes stable voucher identities and all-match with the cursor", async () => {
    const fetcher = mockFetch({ reports: [] });
    vi.stubGlobal("fetch", fetcher);

    await getFilteredReports({
      perPage: 100,
      cursor: { updatedAt: "2026-08-03T12:00:00Z", id: "90" },
      facets: true,
      filter: {
        ...EMPTY_FILTER,
        vouchers: [
          { chainId: 1, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
          { chainId: 42220, address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
        ],
        voucherMatch: "all",
      },
    });

    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("vouchers")).toBe(
      "1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,42220:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(url.searchParams.get("voucherMatch")).toBe("all");
    expect(url.searchParams.get("cursorUpdatedAt")).toBe("2026-08-03T12:00:00Z");
    expect(url.searchParams.get("cursorId")).toBe("90");
    expect(url.searchParams.get("facets")).toBe("true");
  });

  it("normalizes report relationships and voucher facets while dropping malformed rows", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        reports: [
          {
            id: 90,
            title: "Harvest",
            vouchers: [
              {
                address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                name: "Sarafu",
                symbol: "SRF",
              },
              { id: 18, chainId: 42220, address: "bad", name: "Bad", symbol: "BAD" },
            ],
          },
        ],
        voucherFacets: [
          {
            chainId: 42220,
            address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            name: "Sarafu",
            symbol: "SRF",
            count: 4,
          },
          {
            id: 18,
            chainId: 42220,
            address: "bad",
            name: "Bad",
            symbol: "BAD",
            count: 1,
          },
        ],
      }),
    );

    const page = await getFilteredReports({ perPage: 100, filter: EMPTY_FILTER });

    expect(page.reports[0]?.vouchers).toEqual([
      {
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Sarafu",
        symbol: "SRF",
      },
    ]);
    expect(page.voucherFacets).toEqual([
      {
        chainId: 42220,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Sarafu",
        symbol: "SRF",
        count: 4,
      },
    ]);
  });
});
