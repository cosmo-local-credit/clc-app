import { describe, expect, it } from "vite-plus/test";
import {
  compactSearch,
  formatSeriesTick,
  parseBucketSeconds,
  parseDashboardSearch,
  timeRangeToApiParams,
} from "./time-range";

describe("parseDashboardSearch", () => {
  it("keeps a known preset and drops junk", () => {
    expect(parseDashboardSearch({ range: "1h" })).toEqual({ range: "1h" });
    expect(parseDashboardSearch({ range: "nope" })).toEqual({});
  });

  it("keeps a custom window only when both bounds are present", () => {
    expect(
      parseDashboardSearch({
        range: "custom",
        since: "2026-08-01T00:00:00.000Z",
        until: "2026-08-02T00:00:00.000Z",
      }),
    ).toEqual({
      range: "custom",
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-02T00:00:00.000Z",
    });
    expect(parseDashboardSearch({ range: "custom", since: "2026-08-01T00:00:00.000Z" })).toEqual(
      {},
    );
  });
});

describe("timeRangeToApiParams", () => {
  it("defaults to 1d and passes custom bounds through", () => {
    expect(timeRangeToApiParams({})).toEqual({ range: "1d" });
    expect(
      timeRangeToApiParams({
        range: "custom",
        since: "2026-08-01T00:00:00.000Z",
        until: "2026-08-02T00:00:00.000Z",
      }),
    ).toEqual({
      range: "custom",
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-02T00:00:00.000Z",
    });
  });
});

describe("compactSearch", () => {
  it("omits empty keys so the URL stays clean", () => {
    expect(compactSearch({ range: "6h", since: undefined })).toEqual({ range: "6h" });
  });
});

describe("formatSeriesTick", () => {
  const noon = "2026-08-12T12:00:00.000Z";

  it("uses calendar dates for daily buckets so a multi-day range is readable", () => {
    const date = new Date(noon);
    expect(formatSeriesTick(noon, "1d")).toBe(
      date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    );
  });

  it("uses clock time for hourly buckets", () => {
    const date = new Date(noon);
    expect(formatSeriesTick(noon, "1h")).toBe(
      date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    );
  });

  it("parses API bucket labels", () => {
    expect(parseBucketSeconds("30s")).toBe(30);
    expect(parseBucketSeconds("15m")).toBe(15 * 60);
    expect(parseBucketSeconds("1h")).toBe(3600);
    expect(parseBucketSeconds("6h")).toBe(6 * 3600);
    expect(parseBucketSeconds("1d")).toBe(86_400);
  });
});
