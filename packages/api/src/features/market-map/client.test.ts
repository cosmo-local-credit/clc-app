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

describe("market map HTTP contract", () => {
  it("serializes canonical bounds, kinds, filters, facets and Credit", async () => {
    const fetcher = respond({
      features: [
        {
          type: "cluster",
          id: "cluster:5:2:3",
          lat: 0,
          lng: 20,
          count: 10,
          kinds: { voucher: 7, want: 3 },
          expansionZoom: 7,
        },
      ],
      tagFacets: [{ tag: "Food", count: 7 }],
    });
    const client = createMarketMapClient(createHttpClient({ baseUrl: "https://api.test" }));
    const signal = new AbortController().signal;
    const result = await client.list(
      {
        bounds: [
          { minLng: 170, minLat: -10, maxLng: 180, maxLat: 10 },
          { minLng: -180, minLat: -10, maxLng: -170, maxLat: 10 },
        ],
        zoom: 5.8,
        kinds: ["voucher", "want", "post"],
        filter: { term: "market", tags: ["Food", "Local"], tagMatch: "all" },
        facets: true,
        creditablePools: [{ chainId: 100, address: `0x${"a".repeat(40)}` }],
      },
      signal,
    );

    const url = new URL(fetcher.mock.calls[0]?.[0]);
    expect(url.searchParams.getAll("bbox")).toEqual(["170,-10,180,10", "-180,-10,-170,10"]);
    expect(url.searchParams.get("zoom")).toBe("5.75");
    expect(url.searchParams.getAll("kinds")).toEqual(["voucher", "want", "post"]);
    expect(url.searchParams.getAll("tags")).toEqual(["Food", "Local"]);
    expect(url.searchParams.get("tagMatch")).toBe("all");
    expect(url.searchParams.get("creditablePools")).toBe(`100:0x${"a".repeat(40)}`);
    expect(url.searchParams.has("posted")).toBe(false);
    expect(url.searchParams.has("guest")).toBe(false);
    expect(url.searchParams.has("identity")).toBe(false);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", signal });
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(result.features[0]?.type).toBe("cluster");
  });

  it("sends a non-default post window and omits the 1-month default", async () => {
    const fetcher = respond({ features: [], tagFacets: [] });
    const client = createMarketMapClient(createHttpClient({ baseUrl: "https://api.test" }));
    await client.list({
      bounds: [],
      zoom: 2,
      kinds: ["post"],
      filter: { term: "", tags: [], tagMatch: "any" },
      posted: "all",
    });
    expect(new URL(fetcher.mock.calls[0]?.[0]).searchParams.get("posted")).toBe("all");

    await client.list({
      bounds: [],
      zoom: 2,
      kinds: ["post"],
      filter: { term: "", tags: [], tagMatch: "any" },
      posted: "1m",
    });
    expect(new URL(fetcher.mock.calls[1]?.[0]).searchParams.has("posted")).toBe(false);
  });

  it("rejects malformed successful responses", async () => {
    respond({ features: [{ type: "cluster", id: "bad", count: -1 }] });
    const client = createMarketMapClient(createHttpClient({ baseUrl: "https://api.test" }));
    await expect(
      client.list({
        bounds: [],
        zoom: 2,
        kinds: ["voucher"],
        filter: { term: "", tags: [], tagMatch: "any" },
      }),
    ).rejects.toBeInstanceOf(BackendApiError);
  });
});
