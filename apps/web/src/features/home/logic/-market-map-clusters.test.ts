import { describe, expect, it } from "vite-plus/test";
import {
  CLUSTER_MAX_ZOOM,
  DEFAULT_CLUSTER_OPTIONS,
  EXPLODE_MAX_POINTS,
  EXPLODE_MIN_ZOOM,
  clusterExplosion,
  countPointsInBoxes,
} from "./market-map-clusters";

describe("cluster explosion", () => {
  it("opens a fit at zoom 9 or deeper whatever its size", () => {
    expect(clusterExplosion(EXPLODE_MIN_ZOOM, 5_000)).toEqual({
      options: { cluster: true, clusterMaxZoom: 8 },
      explodedAt: 9,
    });
    expect(clusterExplosion(11.7, 300)).toEqual({
      options: { cluster: true, clusterMaxZoom: 10 },
      explodedAt: 11,
    });
  });

  it("opens a shallow fit only up to 500 resources", () => {
    expect(clusterExplosion(6.4, EXPLODE_MAX_POINTS)).toEqual({
      options: { cluster: true, clusterMaxZoom: 5 },
      explodedAt: 6,
    });
    expect(clusterExplosion(6.4, EXPLODE_MAX_POINTS + 1)).toBeNull();
    expect(clusterExplosion(8.99, 1_175)).toBeNull();
  });

  it("turns clustering off rather than passing a level below 1", () => {
    expect(clusterExplosion(1.5, 20)).toEqual({ options: { cluster: false }, explodedAt: 1 });
    expect(clusterExplosion(0.4, 20)).toEqual({ options: { cluster: false }, explodedAt: 0 });
  });

  it("always names cluster: true alongside a level", () => {
    for (const zoom of [2, 5.5, 9, 12.25, 13.99]) {
      const result = clusterExplosion(zoom, 10);
      expect(result?.options.cluster).toBe(true);
      expect(result?.options).toHaveProperty("clusterMaxZoom");
    }
    expect(DEFAULT_CLUSTER_OPTIONS).toEqual({ cluster: true, clusterMaxZoom: CLUSTER_MAX_ZOOM });
  });

  it("changes nothing for a fit at 14 or deeper, which is already unclustered", () => {
    expect(clusterExplosion(CLUSTER_MAX_ZOOM + 1, 10)).toBeNull();
    expect(clusterExplosion(18, 10)).toBeNull();
    expect(clusterExplosion(Number.NaN, 10)).toBeNull();
  });
});

describe("points in the visible boxes", () => {
  const points = [
    { lat: -3.6884991293904363, lng: 39.830381973540625 },
    { lat: -3.689533599376162, lng: 39.82907096058713 },
    { lat: -3.72, lng: 39.87 },
    { lat: -3.68, lng: 179.98 },
    { lat: -3.68, lng: -179.98 },
  ];

  it("counts every point with no settled viewport", () => {
    expect(countPointsInBoxes(points, [])).toBe(5);
  });

  it("counts fractional coordinates inside one box, edges included", () => {
    expect(
      countPointsInBoxes(points, [
        { minLng: 39.82907096058713, minLat: -3.7, maxLng: 39.84, maxLat: -3.6884991293904363 },
      ]),
    ).toBe(2);
  });

  it("counts both halves of an antimeridian viewport once each", () => {
    expect(
      countPointsInBoxes(points, [
        { minLng: 170, minLat: -10, maxLng: 180, maxLat: 10 },
        { minLng: -180, minLat: -10, maxLng: -170, maxLat: 10 },
      ]),
    ).toBe(2);
  });
});
