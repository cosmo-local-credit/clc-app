import { describe, expect, it } from "vite-plus/test";
import { marketMapFacetsResponseSchema, marketMapPointsResponseSchema } from "./logic";

describe("market map points schema", () => {
  it("accepts every kind with fractional coordinates and default markers", () => {
    const parsed = marketMapPointsResponseSchema.parse({
      points: [
        {
          kind: "voucher",
          resourceId: "0xabc",
          name: "Market voucher",
          lat: -3.6884991293904363,
          lng: 39.830381973540625,
          markerIcon: null,
          markerColor: null,
        },
        { kind: "want", resourceId: "7", name: "", lat: 1.5, lng: -2.25 },
      ],
      truncated: false,
    });

    expect(parsed.points[0]?.lat).toBe(-3.6884991293904363);
    expect(parsed.points[1]).toMatchObject({ markerIcon: null, markerColor: null });
  });

  it("rejects out-of-range locations, unknown kinds and a missing truncation flag", () => {
    const point = { kind: "voucher", resourceId: "1", name: "A", lat: 0, lng: 0 };
    expect(() =>
      marketMapPointsResponseSchema.parse({ points: [{ ...point, lat: 91 }], truncated: false }),
    ).toThrow();
    expect(() =>
      marketMapPointsResponseSchema.parse({
        points: [{ ...point, kind: "offering" }],
        truncated: false,
      }),
    ).toThrow();
    expect(() => marketMapPointsResponseSchema.parse({ points: [point] })).toThrow();
  });
});

describe("market map facets schema", () => {
  it("accepts tag and Post relationship facets", () => {
    const parsed = marketMapFacetsResponseSchema.parse({
      tagFacets: [{ tag: "Food", count: 4 }],
      postVoucherFacets: [
        { id: 1, chainId: 100, address: "0xabc", name: "Voucher", symbol: "VCH", count: 2 },
      ],
      postPoolFacets: [],
    });
    expect(parsed.tagFacets).toEqual([{ tag: "Food", count: 4 }]);
  });

  it("rejects a null facet list", () => {
    expect(() =>
      marketMapFacetsResponseSchema.parse({
        tagFacets: [],
        postVoucherFacets: null,
        postPoolFacets: [],
      }),
    ).toThrow();
  });
});
