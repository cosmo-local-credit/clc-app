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

function respond(result: unknown) {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true, result }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

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
});
