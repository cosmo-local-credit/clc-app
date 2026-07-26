import { apiFetch } from "#/features/auth/api/client";
import {
  type CursorParams,
  type HexAddress,
  formatCursorQuery,
  isPresent,
  normalizeHex,
  normalizeNumber,
  normalizeText,
} from "#/lib/api-normalize";

export type MarketVoucherKind = "goods" | "services" | "voucher";

export type MarketVoucher = {
  id: string;
  chainId: number;
  address: HexAddress;
  name: string;
  symbol: string;
  locationName: string | null;
  lat: number;
  lng: number;
  kind: MarketVoucherKind;
};

export type MarketBoundingBox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type MarketVoucherPage = {
  vouchers: MarketVoucher[];
  first: number;
  last: number;
};

export type MarketVouchersParams = CursorParams & { bbox?: MarketBoundingBox };

type BackendMarketVoucher = Partial<{
  id: string | number;
  chainId: string | number;
  address: string | null;
  name: string | null;
  symbol: string | null;
  locationName: string | null;
  geoLat: string | number | null;
  geoLng: string | number | null;
  kind: string;
}>;

type BackendMarketVoucherPage = {
  vouchers?: BackendMarketVoucher[] | null;
  first?: number;
  last?: number;
};

const MARKET_KINDS = new Set<string>(["goods", "services", "voucher"]);

/**
 * The market catalog is public and byte-identical for every caller, so this
 * request deliberately differs from the authenticated clients: no session
 * cookie (which would only poison a shared cache) and the default browser
 * cache mode, so the endpoint's `max-age=60` actually takes effect.
 */
export async function getMarketVouchers(
  params: MarketVouchersParams,
  signal?: AbortSignal,
): Promise<MarketVoucherPage> {
  const result = await apiFetch<BackendMarketVoucherPage>(
    `/api/v2/vouchers${formatMarketQuery(params)}`,
    { method: "GET", credentials: "omit", signal },
  );

  return {
    vouchers: (result.vouchers ?? []).map(normalizeMarketVoucher).filter(isPresent),
    first: normalizeNumber(result.first) ?? 0,
    last: normalizeNumber(result.last) ?? 0,
  };
}

function formatMarketQuery({ bbox, ...cursor }: MarketVouchersParams): string {
  const query = formatCursorQuery(cursor);
  if (!bbox) return query;
  const box = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].join(",");
  return `${query}&bbox=${encodeURIComponent(box)}`;
}

function normalizeMarketVoucher(voucher: BackendMarketVoucher): MarketVoucher | null {
  // The address survives verbatim: query keys lowercase for cache identity,
  // but the model keeps the checksummed value the backend stored.
  const address = normalizeHex(voucher.address);
  const chainId = normalizeNumber(voucher.chainId);
  const lat = normalizeCoordinate(voucher.geoLat, 90);
  const lng = normalizeCoordinate(voucher.geoLng, 180);
  const kind = voucher.kind;

  if (
    !address ||
    chainId === null ||
    lat === null ||
    lng === null ||
    voucher.id === undefined ||
    voucher.id === null ||
    typeof kind !== "string" ||
    !MARKET_KINDS.has(kind)
  ) {
    return null;
  }

  return {
    id: String(voucher.id),
    chainId,
    address,
    name: normalizeText(voucher.name) ?? "Community Voucher",
    symbol: normalizeText(voucher.symbol) ?? "VOUCHER",
    locationName: normalizeText(voucher.locationName),
    lat,
    lng,
    kind: kind as MarketVoucherKind,
  };
}

function normalizeCoordinate(value: unknown, bound: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= -bound && value <= bound ? value : null;
}

/**
 * Converts a settled map viewport into request-ready boxes.
 *
 * `renderWorldCopies` defaults to true, so MapLibre bounds can carry
 * longitudes outside ±180. A single box with `minLng > maxLng` is rejected by
 * the backend, so a viewport spanning the antimeridian is split into
 * `[west, 180]` and `[-180, east]` and merged by voucher id.
 */
export function viewportToBoundingBoxes(viewport: {
  west: number;
  south: number;
  east: number;
  north: number;
}): MarketBoundingBox[] {
  const { west, south, east, north } = viewport;
  if (![west, south, east, north].every((value) => Number.isFinite(value))) return [];

  const minLat = clamp(Math.min(south, north), -90, 90);
  const maxLat = clamp(Math.max(south, north), -90, 90);

  // A viewport at least one world wide needs no split; ask for everything.
  if (Math.abs(east - west) >= 360) {
    return [{ minLng: -180, minLat, maxLng: 180, maxLat }];
  }

  const minLng = wrapLongitude(west);
  const maxLng = wrapLongitude(east);

  if (minLng <= maxLng) {
    return [{ minLng, minLat, maxLng, maxLat }];
  }

  return [
    { minLng, minLat, maxLng: 180, maxLat },
    { minLng: -180, minLat, maxLng, maxLat },
  ];
}

function wrapLongitude(value: number): number {
  // Modular arithmetic perturbs values that were already valid (36.6 becomes
  // 36.60000000000002), so only wrap what actually needs wrapping.
  if (value >= -180 && value <= 180) return value;
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  // Keep an exact antimeridian edge at 180 rather than flipping it to -180.
  return wrapped === -180 && value > 0 ? 180 : wrapped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
