import type { MarkerColor, MarkerIcon, ReportMarkerIcon } from "@clc/core/features/markers/logic";
import type { WantMarkerIcon } from "@clc/core/features/wants/logic";

/**
 * A voucher's kind is derived by the backend from its available offerings (see
 * `GET /api/v2/vouchers`). There is no eatery/shop/service taxonomy — that was
 * placeholder data. `pool` is a commitment pool, which draws its own square pin.
 */
export type MarketLocationKind =
  | "goods"
  | "services"
  | "voucher"
  | "pool"
  | "want"
  | "catalog"
  | "post";

/**
 * The minimal shape the map needs from a voucher or a pool. `MarketVoucher`
 * from the market client is structurally assignable to this, so real catalog
 * rows are passed straight through with no intermediate view model to keep in
 * sync.
 */
export type MarketLocation = {
  id: string;
  name: string;
  kind: MarketLocationKind;
  /** The issuer's pin; null follows `kind`. Always null for a pool. */
  markerIcon: MarkerIcon | WantMarkerIcon | ReportMarkerIcon | null;
  markerColor: MarkerColor | null;
  lat: number;
  lng: number;
  locationName: string | null;
};

export const MARKET_SOURCE_ID = "market-vouchers";

/**
 * The deepest zoom the map allows.
 *
 * It is also the yardstick for grouping: two markers that still overlap here
 * can never be separated by zooming, so they are stacked instead.
 */
export const MAP_MAX_ZOOM = 20;

/** MapLibre projects one world onto a 512 CSS-pixel square at zoom zero. */
const MAP_WORLD_SIZE_PX = 512;

/**
 * Keep one projected world at least as wide as the viewport. This preserves
 * seamless antimeridian wrapping without letting a wide canvas show duplicate
 * copies of the same geography.
 */
export function marketMinimumZoom(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= MAP_WORLD_SIZE_PX) return 0;
  // Keep a tiny margin above the exact ratio so floating-point rounding cannot
  // make the projected world a fraction of a pixel narrower than the canvas.
  return Math.min(MAP_MAX_ZOOM, Math.log2(viewportWidth / MAP_WORLD_SIZE_PX) + 1e-9);
}
