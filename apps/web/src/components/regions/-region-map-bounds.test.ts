import { describe, expect, it } from "vite-plus/test";
import { regionBounds } from "./region-map-bounds";

describe("assigned region map bounds", () => {
  it("fits a country without stretching to the opposite hemisphere", () => {
    const [west, south, east, north] = regionBounds({
      type: "Polygon",
      coordinates: [
        [
          [88.5, 26.7],
          [92.1, 26.7],
          [92.1, 28.3],
          [88.5, 26.7],
        ],
      ],
    });
    expect([west, south, north]).toEqual([88.5, 26.7, 28.3]);
    expect(east).toBeCloseTo(92.1);
  });

  it("keeps islands on either side of the antimeridian together", () => {
    expect(
      regionBounds({
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [175, -15],
              [177, -15],
              [177, -14],
              [175, -15],
            ],
          ],
          [
            [
              [-179, -20],
              [-176, -20],
              [-176, -19],
              [-179, -20],
            ],
          ],
        ],
      }),
    ).toEqual([175, -20, 184, -14]);
  });
});
