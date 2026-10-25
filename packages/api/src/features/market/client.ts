import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import {
  type MarketKind,
  type MarkerColor,
  type MarkerIcon,
  isMarketKind,
  isMarkerColor,
  isMarkerIcon,
} from "@clc/core/features/markers/logic";

import type { HttpClient } from "../../client/http-client";
import { appendMarketBounds } from "../../lib/catalog-bounds";
import {
  type CursorParams,
  type HexAddress,
  formatCursorQuery,
  isPresent,
  normalizeChainId,
  normalizeCoordinate,
  normalizeHex,
  normalizeNumber,
  normalizeNumericText,
  normalizeText,
} from "../../lib/api-normalize";

export type MarketVoucherKind = MarketKind;

/**
 * The issuer's choice of map pin. Null on either field means "follow the kind",
 * and so does a value this client cannot draw: a slug added to clc-core after
 * this build shipped falls back to the automatic pin instead of a blank one.
 */
export type MarketVoucherMarker = {
  markerIcon: MarkerIcon | null;
  markerColor: MarkerColor | null;
};

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
} & MarketVoucherMarker;

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
  /**
   * Whether the voucher is in the public catalog.
   *
   * Always `true` from the public routes, which resolve active vouchers only —
   * a retired one answers 404 there. It is meaningful on the console reads,
   * which deliberately ignore the gate, and an older deployment that omits the
   * key normalizes to `true` rather than hiding a voucher that is not retired.
   */
  active: boolean;
} & MarketVoucherMarker;

export type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";

export type MarketVoucherPage = {
  vouchers: MarketVoucher[];
  first: number;
  last: number;
  receivedCount: number;
};

export type MarketVouchersParams = CursorParams & {
  bounds?: readonly MarketBoundingBox[];
  nearby?: boolean;
};

export type MarketTagFacet = {
  tag: string;
  count: number;
};

export type FilteredMarketVouchersParams = MarketVouchersParams & {
  filter: CatalogFilter;
  facets?: boolean;
  /** Only vouchers owned by this address. Compared case-insensitively. */
  owner?: string;
  /** Vouchers accepted by at least one of these verified pools. */
  pools?: readonly { chainId: number; address: string }[];
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
  markerIcon: string | null;
  markerColor: string | null;
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
    active: boolean | null;
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
  /**
   * Preserved when omitted, like the images: a client that predates the
   * picker must not reset an issuer's pin on save. Null resets it to the
   * automatic one.
   */
  markerIcon?: MarkerIcon | null;
  markerColor?: MarkerColor | null;
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
 * The display name, the two images and the marker are the exceptions: omitted
 * preserves them, and "" is the only way to clear one, so they are sent only
 * when the caller supplied them.
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
    ...(profile.markerIcon === undefined ? {} : { markerIcon: profile.markerIcon ?? "" }),
    ...(profile.markerColor === undefined ? {} : { markerColor: profile.markerColor ?? "" }),
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
        {
          method: "GET",
          credentials: params.nearby ? "include" : "omit",
          signal,
          ...cachePolicy,
          ...(params.nearby ? { cache: "no-store" as const } : {}),
        },
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

    /**
     * Takes a voucher out of the public catalog.
     *
     * Soft: clc-core flips the `active` flag every market, search and offering
     * statement filters on, so the reports and offerings that reference the
     * voucher keep their foreign keys and a restore returns it intact.
     *
     * Returns nothing on purpose. The other catalog writes answer with the saved
     * row so a caller can seed its cache; this one cannot, because the row it
     * wrote is no longer visible to the detail route. Drop the voucher from the
     * cache instead of re-reading it.
     */
    async retireVoucher(address: string, signal?: AbortSignal): Promise<void> {
      await http.request<unknown>(`/api/v2/vouchers/${encodeURIComponent(address)}`, {
        method: "DELETE",
        cache: "no-store",
        signal,
      });
    },

    async getFilteredMarketVouchers(
      params: FilteredMarketVouchersParams,
      signal?: AbortSignal,
    ): Promise<FilteredMarketVoucherPage> {
      const result = await http.request<BackendFilteredMarketVoucherPage>(
        `/api/v2/vouchers${formatFilteredMarketQuery(params)}`,
        {
          method: "GET",
          credentials: params.nearby ? "include" : "omit",
          signal,
          ...cachePolicy,
          ...(params.nearby ? { cache: "no-store" as const } : {}),
        },
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

function formatMarketQuery({ bounds, nearby, ...cursor }: MarketVouchersParams): string {
  const query = formatCursorQuery(cursor) + (nearby ? "&nearby=true" : "");
  if (!bounds?.length) return query;
  const search = new URLSearchParams(query);
  appendMarketBounds(search, bounds);
  return `?${search.toString()}`;
}

function formatFilteredMarketQuery({
  bounds,
  filter,
  facets,
  owner,
  pools,
  nearby,
  ...cursor
}: FilteredMarketVouchersParams): string {
  const search = new URLSearchParams(formatCursorQuery(cursor));
  appendMarketBounds(search, bounds);
  if (filter.term !== "") search.set("q", filter.term);
  if (filter.tags.length > 0) search.set("tags", filter.tags.join(","));
  if (filter.tags.length > 1 && filter.tagMatch === "all") search.set("tagMatch", "all");
  if (owner) search.set("owner", owner);
  if (pools && pools.length > 0) {
    search.set(
      "pools",
      pools.map((pool) => `${pool.chainId}:${pool.address.toLowerCase()}`).join(","),
    );
  }
  if (facets) search.set("facets", "true");
  if (nearby) search.set("nearby", "true");
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
    !isMarketKind(kind)
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
    kind,
    ...normalizeMarker(voucher),
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
    kind: isMarketKind(kind) ? kind : "voucher",
    active: voucher.active !== false,
    ...normalizeMarker(voucher),
  };
}

function normalizeMarker(voucher: BackendMarketVoucher): MarketVoucherMarker {
  return {
    markerIcon: isMarkerIcon(voucher.markerIcon) ? voucher.markerIcon : null,
    markerColor: isMarkerColor(voucher.markerColor) ? voucher.markerColor : null,
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
