import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { QueryClient } from "@tanstack/react-query";
import { createHttpClient } from "../../client/http-client";
import { createResourceLimitsClient } from "./client";
import { resourceUsageQueryOptions } from "./queries";

afterEach(() => vi.unstubAllGlobals());

describe("resource allowances", () => {
  it("reads fresh server counts and preserves a zero allowance", async () => {
    const quota = { used: 0, limit: 0, canCreate: false, unlimited: false };
    const usage = { vouchers: quota, pools: quota, catalogs: quota, offers: quota, wants: quota };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: { usage } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const client = createResourceLimitsClient(createHttpClient({ baseUrl: "https://api.test" }));
    expect(await client.usage()).toEqual(usage);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("/api/v2/users/me/resource-usage");
    expect(init.cache).toBe("no-store");
  });

  it("does not share another account's usage or fetch for guests", () => {
    const client = { usage: vi.fn() };
    const alice = resourceUsageQueryOptions(client, "0xAlice");
    const bob = resourceUsageQueryOptions(client, "0xBob");
    const cache = new QueryClient();
    const quota = { used: 3, limit: 3, canCreate: false, unlimited: false };
    cache.setQueryData(alice.queryKey, {
      vouchers: quota,
      offers: quota,
      catalogs: quota,
      pools: quota,
      wants: quota,
    });
    expect(cache.getQueryData(bob.queryKey)).toBeUndefined();
    expect(resourceUsageQueryOptions(client, "").enabled).toBe(false);
  });

  it("scopes offering usage and its cache identity to a canonical voucher address", async () => {
    const quota = { used: 2, limit: 3, canCreate: true, unlimited: false };
    const usage = { vouchers: quota, pools: quota, catalogs: quota, offers: quota, wants: quota };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: { usage } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const client = createResourceLimitsClient(createHttpClient({ baseUrl: "https://api.test" }));
    const voucher = `0x${"A".repeat(40)}`;

    expect(await client.usage({ voucher })).toEqual(usage);
    expect(new URL(fetcher.mock.calls[0]?.[0]).searchParams.get("voucher")).toBe(voucher);
    expect(resourceUsageQueryOptions(client, "0xAlice", voucher).queryKey).toEqual(
      resourceUsageQueryOptions(client, "0xAlice", voucher.toLowerCase()).queryKey,
    );
    expect(
      resourceUsageQueryOptions(client, "0xAlice", `0x${"b".repeat(40)}`).queryKey,
    ).not.toEqual(resourceUsageQueryOptions(client, "0xAlice", voucher).queryKey);
  });

  it("rejects an incomplete response instead of assuming zero usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, result: { usage: {} } }), { status: 200 }),
        ),
    );
    const client = createResourceLimitsClient(createHttpClient({ baseUrl: "https://api.test" }));
    await expect(client.usage()).rejects.toThrow();
  });
});
