import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";

/** Pixels of a 512 px tile at the integer zoom that MapLibre groups points within. */
export const CLUSTER_RADIUS = 50;

/**
 * The last clustered zoom level. MapLibre's levels are integers and its tile
 * zoom is `floor(map zoom)`, so from 14.0 nothing is clustered, however the
 * viewer got there.
 */
export const CLUSTER_MAX_ZOOM = 13;

/** From this fitted zoom a clicked cluster always opens into its pins. */
export const EXPLODE_MIN_ZOOM = 9;

/** Below EXPLODE_MIN_ZOOM, a cluster this small still opens into its pins. */
export const EXPLODE_MAX_POINTS = 500;

/**
 * What `setClusterOptions` receives. MapLibre assigns `cluster` unconditionally,
 * so it is always present, and it treats `clusterMaxZoom: 0` as unset, so a
 * level below 1 turns clustering off instead.
 */
export type MarketClusterOptions = { cluster: true; clusterMaxZoom: number } | { cluster: false };

export const DEFAULT_CLUSTER_OPTIONS: MarketClusterOptions = {
  cluster: true,
  clusterMaxZoom: CLUSTER_MAX_ZOOM,
};

/**
 * Whether fitting the camera to a clicked cluster at `fitZoom` should also draw
 * every one of its `markerCount` resources as a pin. `explodedAt` is the integer
 * zoom below which normal clustering must return.
 *
 * A huge cluster seen from far out is not exploded: the camera still fits it,
 * the natural clusters at that zoom show, and the next click goes deeper.
 */
export function clusterExplosion(
  fitZoom: number,
  markerCount: number,
): { options: MarketClusterOptions; explodedAt: number } | null {
  if (!Number.isFinite(fitZoom)) return null;
  const explode = fitZoom >= EXPLODE_MIN_ZOOM || markerCount <= EXPLODE_MAX_POINTS;
  if (!explode || fitZoom >= CLUSTER_MAX_ZOOM + 1) return null;
  const level = Math.floor(fitZoom);
  const target = level - 1;
  return {
    options: target >= 1 ? { cluster: true, clusterMaxZoom: target } : { cluster: false },
    explodedAt: level,
  };
}

/**
 * How many points the viewer can see: those inside any of the visible boxes,
 * edges included. With no settled viewport, every point counts.
 */
export function countPointsInBoxes(
  points: readonly { lat: number; lng: number }[],
  boxes: readonly MarketBoundingBox[],
): number {
  if (boxes.length === 0) return points.length;
  let count = 0;
  for (const point of points) {
    if (
      boxes.some(
        (box) =>
          point.lng >= box.minLng &&
          point.lng <= box.maxLng &&
          point.lat >= box.minLat &&
          point.lat <= box.maxLat,
      )
    ) {
      count += 1;
    }
  }
  return count;
}
