import type { CatalogFilter } from "@clc/core/features/catalog/logic";

import type { HttpClient } from "../../client/http-client";
import {
  type CursorParams,
  type HexAddress,
  formatCursorQuery,
  isPresent,
  normalizeChainId,
  normalizeHex,
  normalizeNumber,
  normalizeNumericText,
  normalizeText,
} from "../../lib/api-normalize";

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
  /** The effective public label: the owner override or, absent one, the ERC20 name. */
  name: string;
  /** The immutable ERC20 name, retained so edit surfaces can distinguish it from the label. */
  contractName?: string | null;
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
  terms: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  /**
   * Always an array. clc-core COALESCEs the aggregate, and an older deployment
   * that omits the key normalizes to `[]` here, so a caller never has to tell a
   * voucher with no tags apart from a response that predates them.
   */
  tags: string[];
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
  /** Only vouchers owned by this address. Compared case-insensitively. */
  owner?: string;
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

export type BackendMarketVoucherDetail = BackendMarketVoucher &
  Partial<{
    contractName: string | null;
    decimals: string | number | null;
    ownerAddress: string | null;
    description: string | null;
    voucherUoa: string | null;
    voucherValue: string | number | null;
    email: string | null;
    website: string | null;
    phone: string | null;
    terms: string | null;
    iconUrl: string | null;
    bannerUrl: string | null;
    tags: unknown;
  }>;

/**
 * A voucher's editable off-chain record, as the owner and admin writes accept it.
 *
 * Assign-all, exactly like `PoolProfileUpdate`: the caller sends the whole record
 * and an empty string clears the field, because clc-core writes every column it
 * receives. Nothing here mirrors the deployed ERC20 — name, symbol, decimals and
 * the owner come from the chain and the endpoint does not accept them.
 */
export type VoucherProfileUpdate = {
  /** Omit to preserve the current override; send an empty string to clear it. */
  displayName?: string;
  description: string;
  voucherUoa: string;
  voucherValue: number | null;
  email: string;
  website: string;
  phone: string;
  terms: string;
  locationName: string;
  geoLat: number | null;
  geoLng: number | null;
  /**
   * The two exceptions to this payload's assign-all rule: omitted preserves the
   * stored image, and `""` removes it. clc-core COALESCEs them precisely so a
   * client that sends no image fields cannot blank a voucher's images while
   * fixing a typo in its description.
   */
  iconUrl?: string;
  bannerUrl?: string;
  tags: string[];
};

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The wire shape of a profile write, shared by the owner and admin routes.
 *
 * Blank text becomes null because clc-core writes every column it receives.
 * The display name and the two images are the exceptions: omitted preserves
 * them, and "" is the only way to clear one, so they pass through untouched and
 * only when the caller supplied them.
 */
export function serializeVoucherProfileUpdate(profile: VoucherProfileUpdate) {
  return {
    description: emptyToNull(profile.description),
    ...(profile.displayName === undefined ? {} : { displayName: profile.displayName }),
    voucherUoa: emptyToNull(profile.voucherUoa),
    voucherValue: profile.voucherValue,
    email: emptyToNull(profile.email),
    website: emptyToNull(profile.website),
    phone: emptyToNull(profile.phone),
    terms: emptyToNull(profile.terms),
    locationName: emptyToNull(profile.locationName),
    geoLat: profile.geoLat,
    geoLng: profile.geoLng,
    ...(profile.iconUrl === undefined ? {} : { iconUrl: profile.iconUrl }),
    ...(profile.bannerUrl === undefined ? {} : { bannerUrl: profile.bannerUrl }),
    tags: profile.tags,
  };
}

type BackendMarketVoucherPage = {
  vouchers?: BackendMarketVoucher[] | null;
  first?: number;
  last?: number;
};

type BackendFilteredMarketVoucherPage = BackendMarketVoucherPage & {
  tagFacets?: { tag?: unknown; count?: unknown }[] | null;
};

const MARKET_KINDS = new Set<string>(["goods", "services", "voucher"]);

export type MarketClient = ReturnType<typeof createMarketClient>;

/**
 * Per-read overrides for the public voucher detail.
 *
 * The client-level `cache` is a property of the app; this is for the one read
 * inside an app that needs the other policy. After the owner writes their
 * record, `"reload"` fetches past the browser's copy of
 * `public, max-age=60, stale-while-revalidate=300` and replaces it, so both the
 * query cache and the HTTP cache hold the row the write produced. A guest
 * browsing the same voucher keeps the shared cache.
 */
export type MarketReadOverrides = {
  cache?: RequestCache;
};

export type CreateMarketClientOptions = {
  /**
   * How these reads treat the browser's HTTP cache.
   *
   * The catalog endpoints answer `Cache-Control: public, max-age=60,
   * stale-while-revalidate=300`, which is deliberate: the representation is
   * identical for every caller, and a phone panning a map should not re-fetch it.
   * The default therefore honours that cache.
   *
   * `"no-store"` is for a console that writes what it reads. After
   * `PUT /admin/vouchers/:address/profile` the caller invalidates its query and
   * refetches — and a cached response hands back the pre-write body, silently
   * replacing the saved record the mutation had just seeded. The write returned
   * 200, the row was correct, and the screen still showed the old value.
   */
  cache?: RequestCache;
};

export function createMarketClient(http: HttpClient, options: CreateMarketClientOptions = {}) {
  // Spread into each request rather than set unconditionally: an explicit
  // `cache: undefined` is not the same as an absent key to every fetch
  // implementation, and the default must be "whatever the platform does".
  const cachePolicy = options.cache ? { cache: options.cache } : {};

  return {
    async getMarketVouchers(
      params: MarketVouchersParams,
      signal?: AbortSignal,
    ): Promise<MarketVoucherPage> {
      const result = await http.request<BackendMarketVoucherPage>(
        `/api/v2/vouchers${formatMarketQuery(params)}`,
        { method: "GET", credentials: "omit", signal, ...cachePolicy },
      );

      const received = result.vouchers ?? [];
      return {
        vouchers: received.map(normalizeMarketVoucher).filter(isPresent),
        first: normalizeNumber(result.first) ?? 0,
        last: normalizeNumber(result.last) ?? 0,
        receivedCount: received.length,
      };
    },

    async getMarketVoucher(
      address: string,
      signal?: AbortSignal,
      overrides: MarketReadOverrides = {},
    ): Promise<MarketVoucherDetail> {
      const result = await http.request<{ voucher?: BackendMarketVoucherDetail | null }>(
        `/api/v2/vouchers/${encodeURIComponent(address)}`,
        {
          method: "GET",
          credentials: "omit",
          signal,
          ...cachePolicy,
          ...(overrides.cache ? { cache: overrides.cache } : {}),
        },
      );

      const voucher = normalizeMarketVoucherDetail(result.voucher);
      if (!voucher) throw new Error("Voucher response did not include a valid address.");
      return voucher;
    },

    /**
     * The owner's write to their voucher's catalog record. Same payload and
     * semantics as the admin route; only the authorization differs.
     */
    async updateVoucherProfile(
      address: string,
      profile: VoucherProfileUpdate,
      signal?: AbortSignal,
    ): Promise<MarketVoucherDetail> {
      const result = await http.request<{ voucher?: BackendMarketVoucherDetail | null }>(
        `/api/v2/vouchers/${encodeURIComponent(address)}/profile`,
        {
          method: "PUT",
          cache: "no-store",
          signal,
          body: JSON.stringify(serializeVoucherProfileUpdate(profile)),
        },
      );
      const voucher = normalizeMarketVoucherDetail(result.voucher);
      if (!voucher) throw new Error("Voucher update response did not include a valid address.");
      return voucher;
    },

    async getFilteredMarketVouchers(
      params: FilteredMarketVouchersParams,
      signal?: AbortSignal,
    ): Promise<FilteredMarketVoucherPage> {
      const result = await http.request<BackendFilteredMarketVoucherPage>(
        `/api/v2/vouchers${formatFilteredMarketQuery(params)}`,
        { method: "GET", credentials: "omit", signal, ...cachePolicy },
      );

      const received = result.vouchers ?? [];
      return {
        vouchers: received.map(normalizeMarketVoucher).filter(isPresent),
        first: normalizeNumber(result.first) ?? 0,
        last: normalizeNumber(result.last) ?? 0,
        receivedCount: received.length,
        tagFacets: result.tagFacets
          ? result.tagFacets.map(normalizeTagFacet).filter(isPresent)
          : null,
      };
    },
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
  owner,
  ...cursor
}: FilteredMarketVouchersParams): string {
  const search = new URLSearchParams(formatCursorQuery(cursor));
  if (bbox) {
    search.set("bbox", [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].join(","));
  }
  if (filter.term !== "") search.set("q", filter.term);
  if (filter.tags.length > 0) search.set("tags", filter.tags.join(","));
  if (filter.tags.length > 1 && filter.tagMatch === "all") search.set("tagMatch", "all");
  if (owner) search.set("owner", owner);
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
  const chainId = normalizeChainId(voucher.chainId);
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

export function normalizeMarketVoucherDetail(
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
    chainId: normalizeChainId(voucher.chainId),
    address,
    name: normalizeText(voucher.name) ?? "Community Voucher",
    contractName: normalizeText(voucher.contractName),
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
    terms: normalizeText(voucher.terms),
    iconUrl: normalizeImageUrl(voucher.iconUrl),
    bannerUrl: normalizeImageUrl(voucher.bannerUrl),
    tags: Array.isArray(voucher.tags)
      ? voucher.tags.filter((tag): tag is string => typeof tag === "string" && tag !== "")
      : [],
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
