import { describe, expect, it, vi } from "vite-plus/test";
import { BackendApiError } from "../../client/errors";
import type { ManagedReportsParams, ReportPage, ReportsClient } from "./client";
import {
  adminReportQueryOptions,
  adminReportsQueryOptions,
  myReportQueryOptions,
  myReportsQueryOptions,
  reportFeedInfiniteQueryOptions,
  reportMapQueryOptions,
  reportKeys,
  reportQueryOptions,
  reportPoolFeedInfiniteQueryOptions,
  reportVoucherFeedInfiniteQueryOptions,
} from "./queries";

const MANAGED: ManagedReportsParams = { perPage: 20, status: "SUBMITTED" };

const AUTHOR = "0xAbC0000000000000000000000000000000000123";

function page(next: ReportPage["next"]): ReportPage {
  return { reports: [], next };
}

describe("reportKeys", () => {
  it("hangs every key off `all` so one invalidation reaches them", () => {
    for (const key of [
      reportKeys.list(20),
      reportKeys.feed(20),
      reportKeys.detail("42"),
      reportKeys.filtered(null, 20),
      reportKeys.map(
        {
          term: "",
          tags: [],
          tagMatch: "any",
          vouchers: [],
          voucherMatch: "any",
          pools: [],
          poolMatch: "any",
        },
        [],
        undefined,
        "future",
        false,
      ),
      reportKeys.voucherFeed(undefined, 20),
      reportKeys.poolFeed(undefined, 20),
      reportKeys.facetVocabulary(),
    ]) {
      expect(key.slice(0, reportKeys.all.length)).toEqual([...reportKeys.all]);
    }
  });

  it("gives the finite list and the infinite feed distinct keys", () => {
    expect(reportKeys.list(20)).not.toEqual(reportKeys.feed(20));
  });

  it("varies the public feed with Post timing", () => {
    expect(reportKeys.feed(20)).not.toEqual(reportKeys.feed(20, "all"));
    expect(reportKeys.filtered(null, 20)).not.toEqual(reportKeys.filtered(null, 20, "all"));
  });

  it("varies with page size and id", () => {
    expect(reportKeys.feed(20)).not.toEqual(reportKeys.feed(50));
    expect(reportKeys.detail("1")).not.toEqual(reportKeys.detail("2"));
  });
});

describe("reportMapQueryOptions", () => {
  const filter = {
    term: "market",
    tags: ["Food"],
    tagMatch: "all" as const,
    vouchers: [],
    voucherMatch: "any" as const,
    pools: [],
    poolMatch: "any" as const,
  };
  const bounds = [{ minLng: 36, minLat: -2, maxLng: 37, maxLat: -1 }] as const;
  const creditablePools = [
    { chainId: 100, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  ] as const;

  it("isolates bounds, Credit pools, filters, and facet mode in its key", () => {
    const base = reportKeys.map(filter, bounds, creditablePools, "future", true);
    expect(base).not.toEqual(reportKeys.map(filter, [], creditablePools, "future", true));
    expect(base).not.toEqual(reportKeys.map(filter, bounds, undefined, "future", true));
    expect(base).not.toEqual(
      reportKeys.map({ ...filter, term: "other" }, bounds, creditablePools, "future", true),
    );
    expect(base).not.toEqual(reportKeys.map(filter, bounds, creditablePools, "future", false));
    expect(base).not.toEqual(reportKeys.map(filter, bounds, creditablePools, "past", true));
  });

  it("keys a Credit catalog on the wallet and the reach digest", () => {
    const alice = { wallet: `0x${"A1".repeat(20)}`, digest: "0x01" };
    const base = reportKeys.map(filter, bounds, undefined, "future", true, alice);
    expect(base).not.toEqual(reportKeys.map(filter, bounds, undefined, "future", true));
    expect(base).not.toEqual(
      reportKeys.map(filter, bounds, undefined, "future", true, {
        ...alice,
        wallet: `0x${"b2".repeat(20)}`,
      }),
    );
    expect(base).not.toEqual(
      reportKeys.map(filter, bounds, undefined, "future", true, { ...alice, digest: "0x02" }),
    );
    expect(base).toEqual(
      reportKeys.map(filter, bounds, undefined, "future", true, {
        ...alice,
        wallet: alice.wallet.toLowerCase(),
      }),
    );
  });

  it("walks every bounded page, sends Credit and AbortSignal, and asks for facets once", async () => {
    const signal = new AbortController().signal;
    const getFilteredReports = vi
      .fn()
      .mockResolvedValueOnce({
        reports: [{ id: "1" }],
        tagFacets: [{ tag: "Food", count: 2 }],
        next: { updatedAt: "2026-10-25T00:00:00Z", id: "1" },
      })
      .mockResolvedValueOnce({ reports: [{ id: "2" }], tagFacets: [], next: null });
    const options = reportMapQueryOptions({ getFilteredReports } as unknown as ReportsClient, {
      filter,
      bounds,
      creditablePools,
      facets: true,
    });
    if (typeof options.queryFn !== "function") throw new Error("expected map query function");

    await expect(options.queryFn({ signal } as never)).resolves.toEqual({
      reports: [{ id: "1" }, { id: "2" }],
      tagFacets: [{ tag: "Food", count: 2 }],
    });
    expect(getFilteredReports).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bounds, creditablePools, facets: true, cursor: undefined }),
      signal,
    );
    expect(getFilteredReports).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ bounds, creditablePools, facets: false }),
      signal,
    );
  });
});

describe("reportFeedInfiniteQueryOptions", () => {
  const options = reportFeedInfiniteQueryOptions({} as ReportsClient, 20);

  it("starts with no cursor", () => {
    expect(options.initialPageParam).toBeUndefined();
  });

  it("continues from the opaque cursor the backend supplied", () => {
    // Reports page by { updatedAt, id }, not a number, so the param is an object.
    const cursor = { updatedAt: "2026-01-01T00:00:00Z", id: "7" };
    expect(options.getNextPageParam(page(cursor), [], undefined, [])).toEqual(cursor);
  });

  it("stops when the backend offers no next cursor", () => {
    expect(options.getNextPageParam(page(null), [], undefined, [])).toBeUndefined();
  });

  it("sends timing on the unfiltered walk", async () => {
    const getReports = vi.fn().mockResolvedValue(page(null));
    const allTime = reportFeedInfiniteQueryOptions(
      { getReports } as unknown as ReportsClient,
      20,
      undefined,
      "all",
    );
    if (typeof allTime.queryFn !== "function") throw new Error("expected feed query function");
    await allTime.queryFn({ pageParam: undefined, signal: new AbortController().signal } as never);
    expect(getReports).toHaveBeenCalledWith(
      expect.objectContaining({ timing: "all" }),
      expect.any(AbortSignal),
    );
  });
});

describe("reportVoucherFeedInfiniteQueryOptions", () => {
  it("asks for all-time posts on a voucher's history", async () => {
    const getFilteredReports = vi.fn().mockResolvedValue(page(null));
    const voucher = {
      chainId: 100,
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    };
    const options = reportVoucherFeedInfiniteQueryOptions(
      { getFilteredReports } as unknown as ReportsClient,
      voucher,
      20,
    );
    if (typeof options.queryFn !== "function")
      throw new Error("expected voucher feed query function");
    await options.queryFn({ pageParam: undefined, signal: new AbortController().signal } as never);
    expect(getFilteredReports).toHaveBeenCalledWith(
      expect.objectContaining({ timing: "all" }),
      expect.any(AbortSignal),
    );
  });
});

describe("reportPoolFeedInfiniteQueryOptions", () => {
  it("asks for all-time Posts related directly or indirectly to a Pool", async () => {
    const getFilteredReports = vi.fn().mockResolvedValue(page(null));
    const pool = {
      chainId: 100,
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const,
    };
    const options = reportPoolFeedInfiniteQueryOptions(
      { getFilteredReports } as unknown as ReportsClient,
      pool,
      3,
    );
    if (typeof options.queryFn !== "function") throw new Error("expected Pool feed query function");
    await options.queryFn({ pageParam: undefined, signal: new AbortController().signal } as never);
    expect(getFilteredReports).toHaveBeenCalledWith(
      expect.objectContaining({
        timing: "all",
        filter: expect.objectContaining({ pools: [pool] }),
      }),
      expect.any(AbortSignal),
    );
  });
});

describe("reportQueryOptions", () => {
  it("stays disabled without an id rather than requesting /reports/undefined", () => {
    expect(reportQueryOptions({} as ReportsClient, undefined).enabled).toBe(false);
    expect(reportQueryOptions({} as ReportsClient, "42").enabled).toBe(true);
  });
});

describe("managed report keys", () => {
  it("keeps the public catalog, one author's own, and the console apart", () => {
    const keys = [
      reportKeys.detail("42"),
      reportKeys.myDetail(AUTHOR, "42"),
      reportKeys.adminDetail("42"),
      reportKeys.mine(AUTHOR, MANAGED),
      reportKeys.adminList(MANAGED),
    ].map((key) => JSON.stringify(key));

    expect(new Set(keys).size).toBe(keys.length);
  });

  // A session switch must not be served the previous account's drafts.
  it("includes the author in every `mine` key, case-folded", () => {
    expect(reportKeys.mine(AUTHOR, MANAGED)).not.toEqual(
      reportKeys.mine("0x0000000000000000000000000000000000000009", MANAGED),
    );
    expect(reportKeys.mine(AUTHOR, MANAGED)).toEqual(
      reportKeys.mine(AUTHOR.toLowerCase(), MANAGED),
    );
  });

  it("varies with every filter dimension", () => {
    expect(reportKeys.adminList(MANAGED)).not.toEqual(
      reportKeys.adminList({ ...MANAGED, status: "APPROVED" }),
    );
    expect(reportKeys.adminList(MANAGED)).not.toEqual(
      reportKeys.adminList({ ...MANAGED, perPage: 50 }),
    );
    expect(reportKeys.adminList(MANAGED)).not.toEqual(
      reportKeys.adminList({ ...MANAGED, author: AUTHOR }),
    );
  });

  // The management reads are not the approved catalog, so they must never reuse
  // its keys.
  it("does not reuse the public detail or list keys", () => {
    expect(reportKeys.myDetail(AUTHOR, "42")).not.toEqual(reportKeys.detail("42"));
    expect(reportKeys.adminDetail("42")).not.toEqual(reportKeys.detail("42"));
    expect(reportKeys.adminList(MANAGED)).not.toEqual(reportKeys.list(20));
  });

  it("nests list and detail under one root per family", () => {
    expect(reportKeys.mine(AUTHOR, MANAGED).slice(0, 3)).toEqual([...reportKeys.mineRoot()]);
    expect(reportKeys.myDetail(AUTHOR, "42").slice(0, 3)).toEqual([...reportKeys.mineRoot()]);
    expect(reportKeys.adminList(MANAGED).slice(0, 3)).toEqual([...reportKeys.adminRoot()]);
    expect(reportKeys.adminDetail("42").slice(0, 3)).toEqual([...reportKeys.adminRoot()]);
  });
});

describe("managed query options", () => {
  // Before the session resolves, "mine" would be answered for whoever the cookie
  // names rather than for nobody.
  it("waits for a session address", () => {
    expect(myReportsQueryOptions({} as ReportsClient, undefined, MANAGED).enabled).toBe(false);
    expect(myReportsQueryOptions({} as ReportsClient, AUTHOR, MANAGED).enabled).toBe(true);
    expect(myReportQueryOptions({} as ReportsClient, undefined, "42").enabled).toBe(false);
    expect(myReportQueryOptions({} as ReportsClient, AUTHOR, undefined).enabled).toBe(false);
    expect(myReportQueryOptions({} as ReportsClient, AUTHOR, "42").enabled).toBe(true);
  });

  it("stays disabled without an id rather than requesting /admin/reports/undefined", () => {
    expect(adminReportQueryOptions({} as ReportsClient, undefined).enabled).toBe(false);
    expect(adminReportQueryOptions({} as ReportsClient, "42").enabled).toBe(true);
  });

  it("keeps the previous page while a filter change is in flight", () => {
    expect(adminReportsQueryOptions({} as ReportsClient, MANAGED).placeholderData).toBeDefined();
  });

  it("retries one transient managed-detail failure and then stops", () => {
    const retry = myReportQueryOptions({} as ReportsClient, AUTHOR, "42").retry;
    if (typeof retry !== "function") throw new Error("expected retry predicate");
    const error = new BackendApiError(503, "temporarily unavailable");

    expect(retry(0, error)).toBe(true);
    expect(retry(1, error)).toBe(false);
  });
});
