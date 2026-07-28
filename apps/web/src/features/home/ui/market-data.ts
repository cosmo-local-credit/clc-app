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
  lat: number;
  lng: number;
  locationName: string | null;
};

export const MARKET_SOURCE_ID = "market-vouchers";
