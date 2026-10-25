import { describe, expect, it } from "vite-plus/test";

import { canonicalMarketBounds, marketBoundsKey } from "./nearby";

describe("market viewport bounds", () => {
  it("sorts and preserves the two halves of an antimeridian viewport", () => {
    expect(
      canonicalMarketBounds([
        { minLng: 179, minLat: -2, maxLng: 180, maxLat: 2 },
        { minLng: -180, minLat: -2, maxLng: -179, maxLat: 2 },
      ]),
    ).toEqual([
      { minLng: -180, minLat: -2, maxLng: -179, maxLat: 2 },
      { minLng: 179, minLat: -2, maxLng: 180, maxLat: 2 },
    ]);
  });

  it("rejects unrelated, overlapping, or excessive boxes", () => {
    expect(
      canonicalMarketBounds([
        { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 },
        { minLng: 2, minLat: 0, maxLng: 3, maxLat: 1 },
      ]),
    ).toEqual([]);
    expect(
      canonicalMarketBounds([
        { minLng: -180, minLat: 0, maxLng: 175, maxLat: 1 },
        { minLng: 170, minLat: 0, maxLng: 180, maxLat: 1 },
      ]),
    ).toEqual([]);
    expect(
      canonicalMarketBounds([
        { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 },
        { minLng: 2, minLat: 0, maxLng: 3, maxLat: 1 },
        { minLng: 4, minLat: 0, maxLng: 5, maxLat: 1 },
      ]),
    ).toEqual([]);
  });

  it("deduplicates equivalent boxes and gives invalid input a Global key", () => {
    const box = { minLng: 36.1, minLat: -2.2, maxLng: 37.3, maxLat: -1.1 };
    expect(canonicalMarketBounds([box, box])).toEqual([box]);
    expect(
      marketBoundsKey([
        { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 },
        { minLng: 2, minLat: 0, maxLng: 3, maxLat: 1 },
      ]),
    ).toBe("global");
  });
});
