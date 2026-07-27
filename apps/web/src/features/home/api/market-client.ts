import { apiFetch } from "#/features/auth/api/client";
import {
  type CursorParams,
  type HexAddress,
  formatCursorQuery,
  isPresent,
  normalizeHex,
  normalizeNumber,
  normalizeNumericText,
  normalizeText,
} from "#/lib/api-normalize";

export type MarketVoucherKind = "goods" | "services" | "voucher";

export type MarketVoucher = {
  id: string;
  chainId: number;
  address: HexAddress;
  name: string;
  symbol: string;
  iconUrl: string | null;
  locationName: string | null;
  lat: number;
  lng: number;
  kind: MarketVoucherKind;
};

/**
 * One voucher's public detail, from `GET /api/v2/vouchers/:address`. Backs both
 * the map's selection card and the voucher page. The catalog carries the small
 * icon field needed by the list; larger descriptive and banner fields remain
 * detail-only.
 *
 * Coordinates are nullable here, unlike `MarketVoucher`. A voucher without them
 * still has a readable page, it simply renders no map.
 */
export type MarketVoucherDetail = {
  id: string;
  chainId: number | null;
  address: HexAddress;
  name: string;
  symbol: string;
  decimals: number | null;
  ownerAddress: HexAddress | null;
  description: string | null;
  /** Free text from the issuer (`KSH`, `Ksh`, `usd`, `Hour`). Never normalized. */
  voucherUoa: string | null;
  /** Kept as text: the column is NUMERIC and a double would lose scale. */
  voucherValue: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  email: string | null;
  website: string | null;
  phone: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
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
  /**
   * How many rows the backend actually sent, before defensive normalization
   * dropped any. Pagination must terminate on this, not on `vouchers.length`:
   * a single malformed row in a full page would otherwise look like a short
   * page and hide the entire rest of the catalog behind it.
   */
  receivedCount: number;
};

export type MarketVouchersParams = CursorParams & { bbox?: MarketBoundingBox };

type BackendMarketVoucher = Partial<{
  id: string | number;
  chainId: string | number;
  address: string | null;
  name: string | null;
  symbol: string | null;
  iconUrl: string | null;
  locationName: string | null;
  geoLat: string | number | null;
  geoLng: string | number | null;
  kind: string;
}>;

type BackendMarketVoucherDetail = BackendMarketVoucher &
  Partial<{
    decimals: string | number | null;
    ownerAddress: string | null;
    description: string | null;
    voucherUoa: string | null;
    voucherValue: string | number | null;
    email: string | null;
    website: string | null;
    phone: string | null;
    iconUrl: string | null;
    bannerUrl: string | null;
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

  const received = result.vouchers ?? [];
  return {
    vouchers: received.map(normalizeMarketVoucher).filter(isPresent),
    first: normalizeNumber(result.first) ?? 0,
    last: normalizeNumber(result.last) ?? 0,
    receivedCount: received.length,
  };
}

/**
 * One voucher by contract address. Public and cacheable for the same reasons as
 * the catalog, so it sends no credentials either.
 */
export async function getMarketVoucher(
  address: string,
  signal?: AbortSignal,
): Promise<MarketVoucherDetail> {
  const result = await apiFetch<{ voucher?: BackendMarketVoucherDetail | null }>(
    `/api/v2/vouchers/${encodeURIComponent(address)}`,
    { method: "GET", credentials: "omit", signal },
  );

  const voucher = normalizeMarketVoucherDetail(result.voucher);
  if (!voucher) throw new Error("Voucher response did not include a valid address.");
  return voucher;
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
    iconUrl: normalizeImageUrl(voucher.iconUrl),
    locationName: normalizeText(voucher.locationName),
    lat,
    lng,
    kind: kind as MarketVoucherKind,
  };
}

function normalizeMarketVoucherDetail(
  voucher: BackendMarketVoucherDetail | null | undefined,
): MarketVoucherDetail | null {
  if (!voucher) return null;

  const address = normalizeHex(voucher.address);
  const kind = voucher.kind;
  if (!address || voucher.id === undefined || voucher.id === null) return null;

  // A map needs both halves of a coordinate, so a row carrying only one is
  // treated as having none rather than being pinned on a meridian.
  const lat = normalizeCoordinate(voucher.geoLat, 90);
  const lng = normalizeCoordinate(voucher.geoLng, 180);
  const hasLocation = lat !== null && lng !== null;

  return {
    id: String(voucher.id),
    chainId: normalizeNumber(voucher.chainId),
    address,
    name: normalizeText(voucher.name) ?? "Community Voucher",
    symbol: normalizeText(voucher.symbol) ?? "VOUCHER",
    decimals: normalizeNumber(voucher.decimals),
    ownerAddress: normalizeHex(voucher.ownerAddress),
    description: normalizeText(voucher.description),
    voucherUoa: normalizeText(voucher.voucherUoa),
    voucherValue: normalizeNumericText(voucher.voucherValue),
    locationName: normalizeText(voucher.locationName),
    lat: hasLocation ? lat : null,
    lng: hasLocation ? lng : null,
    email: normalizeText(voucher.email),
    website: normalizeText(voucher.website),
    phone: normalizeText(voucher.phone),
    iconUrl: normalizeImageUrl(voucher.iconUrl),
    bannerUrl: normalizeImageUrl(voucher.bannerUrl),
    // Unlike a catalog row, an unrecognised kind is not grounds for discarding
    // the whole voucher: it only picks a marker glyph.
    kind:
      typeof kind === "string" && MARKET_KINDS.has(kind) ? (kind as MarketVoucherKind) : "voucher",
  };
}

/**
 * Only absolute http(s) URLs reach an `<img src>`. Catalog values are imported
 * third-party strings, so `javascript:` and `data:` are rejected here rather
 * than relied on being harmless in an image context.
 */
function normalizeImageUrl(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
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
