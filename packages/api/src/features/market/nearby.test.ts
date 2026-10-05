import { describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { createMarketClient } from "./client";
import { createPoolsClient } from "../pools/client";
import { createReportsClient } from "../reports/client";
import { voucherCatalogInfiniteQueryOptions } from "./queries";
import { poolListInfiniteQueryOptions } from "../pools/queries";
import { reportFeedInfiniteQueryOptions } from "../reports/queries";

const filter = {
  term: "local",
  tags: [],
  tagMatch: "any",
  vouchers: [],
  voucherMatch: "any",
} as const;

describe("nearby catalog requests", () => {
  it("sends nearby on all three list/search paths and includes the Market session", async () => {
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            result: { vouchers: [], pools: [], reports: [], first: 0, last: 0 },
          }),
          { status: 200 },
        ),
      ),
    );
    const http = createHttpClient({ baseUrl: "https://api.test", fetch });
    const market = createMarketClient(http);
    const pools = createPoolsClient(http);
    const reports = createReportsClient(http);
    await market.getMarketVouchers({ perPage: 20, nearby: true });
    await market.getFilteredMarketVouchers({
      perPage: 20,
      nearby: true,
      filter: { ...filter, tags: [], vouchers: [] },
    });
    await pools.getPools({ perPage: 20, nearby: true });
    await pools.getFilteredPools({
      perPage: 20,
      nearby: true,
      filter: { ...filter, tags: [], vouchers: [] },
    });
    await reports.getReports({ perPage: 20, nearby: true });
    await reports.getFilteredReports({
      perPage: 20,
      nearby: true,
      filter: { ...filter, tags: [], vouchers: [] },
    });
    expect(fetch).toHaveBeenCalledTimes(6);
    for (const [url, init] of fetch.mock.calls) {
      expect(new URL(url).searchParams.get("nearby")).toBe("true");
      expect(init.credentials).toBe("include");
      expect(init.cache).toBe("no-store");
    }
    await market.getMarketVouchers({ perPage: 20 });
    const [url, init] = fetch.mock.calls.at(-1)!;
    expect(new URL(url).searchParams.has("nearby")).toBe(false);
    expect(init.credentials).toBe("omit");
  });

  it("keeps ordinary, account A, and account B query keys separate", () => {
    const http = createHttpClient({ baseUrl: "https://api.test" });
    const factories = [
      (scope?: string) => voucherCatalogInfiniteQueryOptions(createMarketClient(http), 20, scope),
      (scope?: string) => poolListInfiniteQueryOptions(createPoolsClient(http), 20, scope),
      (scope?: string) => reportFeedInfiniteQueryOptions(createReportsClient(http), 20, scope),
    ];
    for (const factory of factories) {
      expect(factory("nearby:A").queryKey).not.toEqual(factory().queryKey);
      expect(factory("nearby:A").queryKey).not.toEqual(factory("nearby:B").queryKey);
    }
  });
});
