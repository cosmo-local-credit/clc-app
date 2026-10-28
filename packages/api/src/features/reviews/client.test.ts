import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { createReviewsClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("reviews client", () => {
  it("uses resource-specific paths and forwards list filters", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            reviews: [],
            counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            total: 0,
            average: 0,
            next: null,
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = createReviewsClient(createHttpClient({ baseUrl: "https://api.test" }));

    await client.list(
      { kind: "pool", address: "0xPool" },
      { stars: 4, before: 12 },
      new AbortController().signal,
    );
    const url = new URL(fetcher.mock.calls[0]![0]);
    expect(url.pathname).toBe("/api/v2/pools/0xPool/reviews");
    expect(url.searchParams.get("stars")).toBe("4");
    expect(url.searchParams.get("before")).toBe("12");
    expect(fetcher.mock.calls[0]![1].cache).toBe("no-store");
  });

  it("writes reviews, replies, and flags without author identity", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true, result: { saved: true } }), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const client = createReviewsClient(createHttpClient({ baseUrl: "https://api.test" }));
    const target = { kind: "voucher" as const, address: "0xVoucher" };

    await client.save(target, 5, "Excellent");
    await client.reply(target, 8, "Thank you");
    await client.flag(target, 8, "Private information");

    expect(new URL(fetcher.mock.calls[0]![0]).pathname).toBe(
      "/api/v2/vouchers/0xVoucher/reviews/me",
    );
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
      stars: 5,
      comment: "Excellent",
    });
    expect(new URL(fetcher.mock.calls[1]![0]).pathname).toBe(
      "/api/v2/vouchers/0xVoucher/reviews/8/reply",
    );
    expect(new URL(fetcher.mock.calls[2]![0]).pathname).toBe(
      "/api/v2/vouchers/0xVoucher/reviews/8/flag",
    );
  });
});
