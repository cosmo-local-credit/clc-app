import type { RegionBoundary } from "@clc/core/features/regions/logic";

const MAX_MERCATOR_LAT = 85.051129;

/** Fit the narrow longitude span, keeping antimeridian islands in view together. */
export function regionBounds(boundary: RegionBoundary): [number, number, number, number] {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  const longitudes: number[] = [];
  let south = 90;
  let north = -90;
  for (const [outer] of polygons) {
    for (const [lng, lat] of outer) {
      longitudes.push(lng < 0 ? lng + 360 : lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  if (longitudes.length === 0) return [-180, -MAX_MERCATOR_LAT, 180, MAX_MERCATOR_LAT];
  longitudes.sort((a, b) => a - b);

  let widestGap = -1;
  let west = longitudes[0];
  let east = west;
  for (let i = 0; i < longitudes.length; i++) {
    const after = longitudes[i + 1] ?? longitudes[0] + 360;
    const gap = after - longitudes[i];
    if (gap > widestGap) {
      widestGap = gap;
      west = after % 360;
      east = west + (360 - gap);
    }
  }
  if (west > 180) {
    west -= 360;
    east -= 360;
  }
  const clampLat = (lat: number) => Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  return [west, clampLat(south), east, clampLat(north)];
}
