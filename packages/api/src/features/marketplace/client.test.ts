import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createHttpClient } from "../../client/http-client";
import { BackendApiError } from "../../client/errors";
import { createMarketplaceClient } from "./client";

const api = createMarketplaceClient(createHttpClient({ baseUrl: "https://api.test" }));
const offering = {
  kind: "offering",
  id: 7,
  chainId: 100,
  address: `0x${"a".repeat(40)}`,
  name: "Repair bicycles",
  description: null,
  symbol: "BIKE",
  imageUrl: null,
  markerIcon: null,
  markerColor: null,
  voucherKind: null,
  locationName: "Kilifi",
  geoLat: -3.63,
  geoLng: 39.85,
  distanceMeters: 125,
  tags: ["Repair"],
  voucherAddress: `0x${"a".repeat(40)}`,
  voucherName: "Bike Repair",
  voucherSymbol: "BIKE",
  voucherUoa: "KES",
  priceInUnitOfAccount: "122.5",
  unit: "service",
  poolCount: null,
  voucherCount: null,
  createdAt: "2026-10-12T10:00:00Z",
  updatedAt: "2026-10-12T10:00:00Z",
};
const post = {
  ...offering,
  kind: "post",
  id: "90",
  chainId: null,
  address: null,
  symbol: null,
  markerIcon: "event",
  markerColor: "pink",
  voucherKind: null,
  voucherAddress: null,
  voucherName: null,
  voucherSymbol: null,
  voucherUoa: null,
  priceInUnitOfAccount: null,
  unit: null,
  relatedKind: "pool",
  relatedName: "Kilifi Pool",
  relatedSymbol: "KLP",
};

function respond(result: unknown) {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true, result }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe("marketplace Credit depth", () => {
  const credit = { depth: 2 as const, wallet: `0x${"a1".repeat(20)}`, digest: "0x01" };

  it("sends creditDepth with the session cookie and no pool list", async () => {
    const fetcher = respond({ results: [], nextCursor: null });
    await api.list({ kinds: ["voucher"], credit });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.searchParams.get("creditDepth")).toBe("2");
    expect(url.searchParams.has("pools")).toBe(false);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  it("refuses to combine creditDepth with pools", async () => {
    const fetcher = respond({ results: [], nextCursor: null });
    await expect(
      api.list({ credit, pools: [{ chainId: 100, address: `0x${"a".repeat(40)}` }] }),
    ).rejects.toThrow(/creditDepth/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("marketplace HTTP contract", () => {
  it("serializes mixed discovery filters and keeps nearby requests private", async () => {
    const fetcher = respond({
      results: [offering],
      nextCursor: "next",
      tagFacets: [{ tag: "Repair", count: 4 }],
    });
    const page = await api.list({
      q: "  bike  ",
      kinds: ["offering", "voucher"],
      tags: ["Repair", "Local"],
      tagMatch: "all",
      facets: true,
      nearby: true,
      pools: [{ chainId: 100, address: `0x${"b".repeat(40)}` }],
    });
    const url = new URL(fetcher.mock.calls[0]?.[0]);
    expect(url.searchParams.get("q")).toBe("bike");
    expect(url.searchParams.get("kinds")).toBe("offering,voucher");
    expect(url.searchParams.get("tags")).toBe("Repair,Local");
    expect(url.searchParams.get("tagMatch")).toBe("all");
    expect(url.searchParams.get("facets")).toBe("true");
    expect(url.searchParams.get("nearby")).toBe("true");
    expect(url.searchParams.get("pools")).toBe(`100:0x${"b".repeat(40)}`);
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe("include");
    expect(page.results[0]?.kind).toBe("offering");
    expect(page.tagFacets).toEqual([{ tag: "Repair", count: 4 }]);
  });

  it("keeps global discovery public and rejects malformed mixed rows", async () => {
    const fetcher = respond({ results: [offering], nextCursor: null });
    await api.list({});
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe("omit");
    expect(fetcher.mock.calls[0]?.[1].cache).toBe("no-store");

    respond({ results: [{ ...offering, geoLat: null }], nextCursor: null });
    await expect(api.list({})).rejects.toBeInstanceOf(BackendApiError);
  });

  it("forwards an opaque cursor without enabling all-tag matching for one tag", async () => {
    const fetcher = respond({ results: [offering], nextCursor: null });
    await api.list({ cursor: "opaque+/=", tags: ["Repair"], tagMatch: "all" });

    const url = new URL(fetcher.mock.calls[0]?.[0]);
    expect(url.searchParams.get("cursor")).toBe("opaque+/=");
    expect(url.searchParams.get("tags")).toBe("Repair");
    expect(url.searchParams.has("tagMatch")).toBe(false);
  });

  it("requests explicit Posts and nearest ordering for an exact viewport", async () => {
    const fetcher = respond({ results: [post], nextCursor: null, total: 1201 });
    const page = await api.list({
      kinds: ["voucher", "post"],
      sort: "nearest",
      bounds: [{ minLng: 39.5, minLat: -4.2, maxLng: 39.8, maxLat: -3.9 }],
      postTiming: "past",
      postVouchers: [
        { chainId: 100, address: `0x${"c".repeat(40)}` },
        { chainId: 100, address: `0x${"d".repeat(40)}` },
      ],
      postVoucherMatch: "all",
      postPools: [{ chainId: 100, address: `0x${"e".repeat(40)}` }],
    });

    const url = new URL(fetcher.mock.calls[0]?.[0]);
    expect(url.searchParams.get("kinds")).toBe("voucher,post");
    expect(url.searchParams.get("sort")).toBe("nearest");
    expect(url.searchParams.getAll("bbox")).toEqual(["39.5,-4.2,39.8,-3.9"]);
    expect(url.searchParams.get("postTiming")).toBe("past");
    expect(url.searchParams.get("postVouchers")).toBe(
      `100:0x${"c".repeat(40)},100:0x${"d".repeat(40)}`,
    );
    expect(url.searchParams.get("postVoucherMatch")).toBe("all");
    expect(url.searchParams.get("postPools")).toBe(`100:0x${"e".repeat(40)}`);
    expect(url.searchParams.has("postPoolMatch")).toBe(false);
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe("include");
    expect(page.total).toBe(1201);
    expect(page.results[0]).toMatchObject({
      kind: "post",
      id: "90",
      relatedKind: "pool",
      relatedName: "Kilifi Pool",
    });
  });
});
