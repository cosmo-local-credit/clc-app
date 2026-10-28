import { describe, expect, it } from "vite-plus/test";
import { canonicalMarketMapZoom, marketMapResponseSchema } from "./logic";

describe("market map zoom", () => {
  it.each([
    [5.8, 5.75],
    [14.74, 14.5],
    [14.75, 14.75],
    [20.99, 20.75],
  ])("canonicalizes %s to the quarter bucket %s", (input, expected) => {
    expect(canonicalMarketMapZoom(input)).toBe(expected);
  });

  it("clamps invalid and out-of-range values", () => {
    expect(canonicalMarketMapZoom(Number.NaN)).toBe(0);
    expect(canonicalMarketMapZoom(-1)).toBe(0);
    expect(canonicalMarketMapZoom(30)).toBe(22);
  });
});

describe("market map response schema", () => {
  it("accepts lightweight markers and server clusters", () => {
    const parsed = marketMapResponseSchema.parse({
      features: [
        {
          type: "marker",
          id: "marker:voucher:0xabc",
          kind: "voucher",
          resourceId: "0xabc",
          name: "Market voucher",
          lat: -3.63,
          lng: 39.85,
          markerIcon: null,
          markerColor: null,
        },
        {
          type: "cluster",
          id: "cluster:4:1:2",
          lat: 0,
          lng: 20,
          count: 12,
          kinds: { voucher: 8, want: 4 },
          expansionZoom: 6,
        },
      ],
      tagFacets: [{ tag: "Food", count: 4 }],
    });

    expect(parsed.features[0]?.type).toBe("marker");
    expect(parsed.features[1]?.type).toBe("cluster");
  });

  it("rejects out-of-range locations and unknown resource kinds", () => {
    expect(() =>
      marketMapResponseSchema.parse({
        features: [
          {
            type: "marker",
            id: "bad",
            kind: "offering",
            resourceId: "7",
            name: "Bad",
            lat: 91,
            lng: 0,
          },
        ],
      }),
    ).toThrow();
  });
});
