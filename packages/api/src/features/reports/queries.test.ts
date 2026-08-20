import { describe, expect, it } from "vite-plus/test";
import type { ReportPage, ReportsClient } from "./client";
import { reportFeedInfiniteQueryOptions, reportKeys, reportQueryOptions } from "./queries";

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
