import type { CatalogFilter } from "@clc/core/features/catalog/logic";

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

export type MarketVoucherDetail = {
  id: string;
  chainId: number | null;
  address: HexAddress;
  name: string;
  symbol: string;
  decimals: number | null;
  ownerAddress: HexAddress | null;
  description: string | null;
  voucherUoa: string | null;
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
  receivedCount: number;
};

export type MarketVouchersParams = CursorParams & { bbox?: MarketBoundingBox };

export type MarketTagFacet = {
  tag: string;
  count: number;
};

export type FilteredMarketVouchersParams = MarketVouchersParams & {
  filter: CatalogFilter;
  facets?: boolean;
};

export type FilteredMarketVoucherPage = MarketVoucherPage & {
  tagFacets: MarketTagFacet[] | null;
};

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

type BackendFilteredMarketVoucherPage = BackendMarketVoucherPage & {
  tagFacets?: { tag?: unknown; count?: unknown }[] | null;
};

const MARKET_KINDS = new Set<string>(["goods", "services", "voucher"]);

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

export async function getFilteredMarketVouchers(
  params: FilteredMarketVouchersParams,
  signal?: AbortSignal,
): Promise<FilteredMarketVoucherPage> {
  const result = await apiFetch<BackendFilteredMarketVoucherPage>(
    `/api/v2/vouchers${formatFilteredMarketQuery(params)}`,
    { method: "GET", credentials: "omit", signal },
  );

  const received = result.vouchers ?? [];
  return {
    vouchers: received.map(normalizeMarketVoucher).filter(isPresent),
    first: normalizeNumber(result.first) ?? 0,
    last: normalizeNumber(result.last) ?? 0,
    receivedCount: received.length,
    tagFacets: result.tagFacets ? result.tagFacets.map(normalizeTagFacet).filter(isPresent) : null,
  };
}

function formatMarketQuery({ bbox, ...cursor }: MarketVouchersParams): string {
  const query = formatCursorQuery(cursor);
  if (!bbox) return query;
  const box = [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].join(",");
  return `${query}&bbox=${encodeURIComponent(box)}`;
}

function formatFilteredMarketQuery({
  bbox,
  filter,
  facets,
  ...cursor
}: FilteredMarketVouchersParams): string {
  const search = new URLSearchParams(formatCursorQuery(cursor));
  if (bbox) {
    search.set("bbox", [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].join(","));
  }
  if (filter.term !== "") search.set("q", filter.term);
  if (filter.tags.length > 0) search.set("tags", filter.tags.join(","));
  if (filter.tags.length > 1 && filter.tagMatch === "all") search.set("tagMatch", "all");
  if (facets) search.set("facets", "true");
  return `?${search.toString()}`;
}

function normalizeTagFacet(facet: { tag?: unknown; count?: unknown }): MarketTagFacet | null {
  const tag = normalizeText(facet.tag);
  const count = normalizeNumber(facet.count);
  if (!tag || count === null || count < 0) return null;
  return { tag, count };
}

function normalizeMarketVoucher(voucher: BackendMarketVoucher): MarketVoucher | null {
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
    kind:
      typeof kind === "string" && MARKET_KINDS.has(kind) ? (kind as MarketVoucherKind) : "voucher",
  };
}

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
  if (value >= -180 && value <= 180) return value;
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && value > 0 ? 180 : wrapped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
