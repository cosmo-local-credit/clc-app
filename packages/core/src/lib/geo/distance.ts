export type Coordinates = { lat: number; lng: number };

/**
 * A quantized distance ready for display. Deliberately not a string: the web
 * layer routes the complete unit-bearing message through Lingui so translators
 * can reorder value and unit, which concatenating a translated unit fragment
 * would prevent.
 */
export type DistanceDisplay = {
  value: number;
  unit: "m" | "km";
  fractionDigits: 0 | 1;
};

const ONE_KILOMETER_IN_METERS = 1_000;
const ONE_DECIMAL_CEILING_IN_METERS = 100_000;

/** IUGG mean Earth radius, in metres. */
const EARTH_RADIUS_METERS = 6_371_008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function assertCoordinates({ lat, lng }: Coordinates): void {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`Latitude out of range: ${lat}`);
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError(`Longitude out of range: ${lng}`);
  }
}

export function haversineMeters(from: Coordinates, to: Coordinates): number {
  assertCoordinates(from);
  assertCoordinates(to);
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistance(meters: number): DistanceDisplay {
  if (!Number.isFinite(meters) || meters < 0) {
    throw new RangeError(`Distance out of range: ${meters}`);
  }
  if (meters < ONE_KILOMETER_IN_METERS) {
    return { value: Math.round(meters / 10) * 10, unit: "m", fractionDigits: 0 };
  }
  const kilometers = meters / ONE_KILOMETER_IN_METERS;
  if (meters <= ONE_DECIMAL_CEILING_IN_METERS) {
    return { value: Math.round(kilometers * 10) / 10, unit: "km", fractionDigits: 1 };
  }
  return { value: Math.round(kilometers), unit: "km", fractionDigits: 0 };
}
