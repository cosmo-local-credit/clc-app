import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";

/** Repeated bbox values preserve antimeridian viewports without a wrapping SQL box. */
export function appendMarketBounds(
  search: URLSearchParams,
  bounds: readonly MarketBoundingBox[] | undefined,
): void {
  for (const box of bounds ?? []) {
    search.append("bbox", [box.minLng, box.minLat, box.maxLng, box.maxLat].join(","));
  }
}
