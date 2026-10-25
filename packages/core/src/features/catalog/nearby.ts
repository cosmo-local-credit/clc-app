export type MarketBoundingBox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

/**
 * Public discovery scope. `nearby: true` remains for older authenticated
 * clients; current web discovery sends the settled map rectangles instead.
 */
export type NearbyRequest =
  | {
      nearby: false;
      scope?: string;
      bounds?: readonly MarketBoundingBox[];
    }
  | { nearby: true; scope: string; bounds?: never };

const BOUNDS_PRECISION = 6;

export function canonicalMarketBounds(
  bounds: readonly MarketBoundingBox[],
): readonly MarketBoundingBox[] {
  const canonical = bounds
    .filter(
      ({ minLng, minLat, maxLng, maxLat }) =>
        [minLng, minLat, maxLng, maxLat].every(Number.isFinite) &&
        minLng >= -180 &&
        maxLng <= 180 &&
        minLat >= -90 &&
        maxLat <= 90 &&
        minLng <= maxLng &&
        minLat <= maxLat,
    )
    .map(({ minLng, minLat, maxLng, maxLat }) => ({
      minLng: roundCoordinate(minLng),
      minLat: roundCoordinate(minLat),
      maxLng: roundCoordinate(maxLng),
      maxLat: roundCoordinate(maxLat),
    }))
    .sort((left, right) =>
      ["minLng", "minLat", "maxLng", "maxLat"].reduce(
        (result, key) =>
          result || left[key as keyof MarketBoundingBox] - right[key as keyof MarketBoundingBox],
        0,
      ),
    )
    .filter(
      (box, index, all) => index === 0 || JSON.stringify(box) !== JSON.stringify(all[index - 1]),
    );
  if (canonical.length > 2) return [];
  if (canonical.length === 2) {
    const [left, right] = canonical;
    if (
      !left ||
      !right ||
      left.minLng !== -180 ||
      right.maxLng !== 180 ||
      left.minLat !== right.minLat ||
      left.maxLat !== right.maxLat ||
      left.maxLng >= right.minLng
    ) {
      return [];
    }
  }
  return canonical;
}

export function marketBoundsKey(bounds: readonly MarketBoundingBox[] | undefined): string {
  const canonical = canonicalMarketBounds(bounds ?? []);
  return canonical.length ? JSON.stringify(canonical) : "global";
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(BOUNDS_PRECISION));
}
