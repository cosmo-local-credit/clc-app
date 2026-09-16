import { describe, expect, it } from "vite-plus/test";
import type { ManagedReportsParams, ReportPage, ReportsClient } from "./client";
import {
  adminReportQueryOptions,
  adminReportsQueryOptions,
  myReportQueryOptions,
  myReportsQueryOptions,
  reportFeedInfiniteQueryOptions,
  reportKeys,
  reportQueryOptions,
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
      reportKeys.voucherFeed(undefined, 20),
      reportKeys.facetVocabulary(),
    ]) {
      expect(key.slice(0, reportKeys.all.length)).toEqual([...reportKeys.all]);
    }
  });

  it("gives the finite list and the infinite feed distinct keys", () => {
    expect(reportKeys.list(20)).not.toEqual(reportKeys.feed(20));
  });

  it("varies with page size and id", () => {
    expect(reportKeys.feed(20)).not.toEqual(reportKeys.feed(50));
    expect(reportKeys.detail("1")).not.toEqual(reportKeys.detail("2"));
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
});
