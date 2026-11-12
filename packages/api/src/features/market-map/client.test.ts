import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHttpClient } from "../../client/http-client";
import { BackendApiError } from "../../client/errors";
import { createMarketMapClient } from "./client";

function respond(result: unknown) {
  const body = JSON.stringify({ ok: true, result });
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(body, { status: 200 })));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

const client = () => createMarketMapClient(createHttpClient({ baseUrl: "https://api.test" }));

describe("market map points HTTP contract", () => {
  it("serializes kinds, filters and Credit, and never a viewport or zoom", async () => {
    const fetcher = respond({
      points: [
        {
          kind: "voucher",
          resourceId: "0xabc",
          name: "Market voucher",
          lat: -3.63,
          lng: 39.85,
          markerIcon: null,
          markerColor: null,
        },
      ],
      truncated: false,
    });
    const signal = new AbortController().signal;
    const result = await client().points(
      {
        kinds: ["voucher", "want", "post"],
        filter: { term: "market", tags: ["Food", "Local"], tagMatch: "all" },
        creditablePools: [{ chainId: 100, address: `0x${"a".repeat(40)}` }],
      },
      signal,
    );

    const url = new URL(fetcher.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v2/market-map/points");
    expect(url.searchParams.has("bbox")).toBe(false);
    expect(url.searchParams.has("zoom")).toBe(false);
    expect(url.searchParams.has("facets")).toBe(false);
    expect(url.searchParams.getAll("kinds")).toEqual(["voucher", "want", "post"]);
    expect(url.searchParams.get("q")).toBe("market");
    expect(url.searchParams.getAll("tags")).toEqual(["Food", "Local"]);
    expect(url.searchParams.get("tagMatch")).toBe("all");
    expect(url.searchParams.get("creditablePools")).toBe(`100:0x${"a".repeat(40)}`);
    expect(url.searchParams.get("postTiming")).toBe("future");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", signal });
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(result).toEqual({
      points: [expect.objectContaining({ kind: "voucher", resourceId: "0xabc" })],
      truncated: false,
    });
  });

  it("sends Post timing and relationship filters", async () => {
    const fetcher = respond({ points: [], truncated: false });
    await client().points({
      kinds: ["post"],
      filter: { term: "", tags: [], tagMatch: "any" },
      postTiming: "all",
      postVouchers: [
        { chainId: 100, address: `0x${"b".repeat(40)}` },
        { chainId: 100, address: `0x${"d".repeat(40)}` },
      ],
      postVoucherMatch: "all",
      postPools: [{ chainId: 100, address: `0x${"c".repeat(40)}` }],
    });
    const search = new URL(fetcher.mock.calls[0]?.[0]).searchParams;
    expect(search.get("postTiming")).toBe("all");
    expect(search.getAll("postVouchers")).toEqual([
      `100:0x${"b".repeat(40)}`,
      `100:0x${"d".repeat(40)}`,
    ]);
    expect(search.get("postVoucherMatch")).toBe("all");
    expect(search.get("postPools")).toBe(`100:0x${"c".repeat(40)}`);
    expect(search.has("postPoolMatch")).toBe(false);
  });

  it("rejects malformed successful responses", async () => {
    respond({ points: [{ kind: "voucher", resourceId: "1", name: "A", lat: 120, lng: 0 }] });
    await expect(
      client().points({ kinds: ["voucher"], filter: { term: "", tags: [], tagMatch: "any" } }),
    ).rejects.toBeInstanceOf(BackendApiError);
  });
});

describe("market map facets HTTP contract", () => {
  it("sends the exact visible boxes with the filters", async () => {
    const fetcher = respond({
      tagFacets: [{ tag: "Food", count: 7 }],
      postVoucherFacets: [],
      postPoolFacets: [],
    });
    const result = await client().facets({
      bounds: [
        { minLng: 170, minLat: -10, maxLng: 180, maxLat: 10 },
        { minLng: -180, minLat: -10, maxLng: -170, maxLat: 10 },
      ],
      kinds: ["voucher"],
      filter: { term: "", tags: [], tagMatch: "any" },
    });
    const url = new URL(fetcher.mock.calls[0]?.[0]);
    expect(url.pathname).toBe("/api/v2/market-map/facets");
    expect(url.searchParams.getAll("bbox")).toEqual(["170,-10,180,10", "-180,-10,-170,10"]);
    expect(url.searchParams.has("zoom")).toBe(false);
    expect(result.tagFacets).toEqual([{ tag: "Food", count: 7 }]);
  });
});
