import type { MarkerColor, MarkerIcon } from "@clc/core/features/markers/logic";

/**
 * Marker kinds are derived by the backend from a voucher's available
 * offerings (see `GET /api/v2/vouchers`). There is no eatery/shop/service
 * taxonomy — that was placeholder data.
 */
export type MarketLocationKind = "goods" | "services" | "voucher";

/**
 * The minimal shape the map needs from a voucher. `MarketVoucher` from the
 * market client is structurally assignable to this, so real catalog rows are
 * passed straight through with no intermediate view model to keep in sync.
 */
export type MarketLocation = {
  id: string;
  name: string;
  kind: MarketLocationKind;
  /** The issuer's pin; null follows `kind`. */
  markerIcon: MarkerIcon | null;
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
