import {
  type OfferingCommodityType,
  type OfferingWrite,
  isOfferingCommodityType,
  offeringWriteSchema,
} from "@clc/core/features/offerings/logic";

import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";
import {
  type CursorParams,
  type HexAddress,
  formatCursorQuery,
  isPresent,
  normalizeHex,
  normalizeID,
  normalizeNumber,
  normalizeNumericText,
  normalizeStringArray,
  normalizeText,
} from "../../lib/api-normalize";

export type OfferingFrequency = "day" | "week" | "month" | "year";

export type { OfferingWrite };

/**
 * One offering, in the app's vocabulary.
 *
 * The backend wire keeps the names the Sarafu import gave it — `commodityName`,
 * `price`, free-text `unit` — and it stays that way on purpose: a previous
 * service-worker-controlled web bundle may outlive any deploy, and renaming a
 * response key would break it. So the rename lives here, in the one place both
 * apps read the backend through, rather than as a second server representation
 * with a compatibility window to close.
 */
export type Offering = {
  id: string;
  sourceId: string | null;
  voucherId: string;
  voucherAddress: HexAddress;
  voucherName: string | null;
  voucherSymbol: string | null;
  voucherUoa: string | null;
  priceInUnitOfAccount: string | null;
  voucherDecimals: number | null;
  voucherImageUrl?: string | null;
  voucherLocationName?: string | null;
  voucherGeoLat?: number | null;
  voucherGeoLng?: number | null;
  /**
   * The historical seller. Provenance, not authority: writes are authorized
   * against the voucher's current owner, so this may name an address with no
   * remaining connection to the voucher.
   */
  sellerAddress: HexAddress;
  /** Backend `commodityName`. */
  name: string;
  /**
   * `GOOD` or `SERVICE`, or `null` for an imported row carrying neither.
   *
   * `null` is displayable but not resubmittable: an edit has to state one, the
   * same way an unknown unit has to be replaced.
   */
  commodityType: OfferingCommodityType | null;
  description: string;
  /**
   * The imported stock figure. Still read, never written: rows this app creates
   * carry the compatibility value 1, which must not be rendered as "1 available".
   */
  quantity: string;
  /**
   * The stored unit as a value a write may reuse. Custom units are first-class,
   * so every nonblank stored value is editable.
   */
  unit: string | null;
  /**
   * The unit exactly as stored, for display.
   *
   * Separate from `unit` because the two questions differ: an imported
   * "50kg sack" is perfectly good to show and impossible to resubmit. Collapsing
   * them would either loosen every write or turn a legible imported listing into
   * "unit not set".
   */
  unitLabel: string | null;
  frequency: OfferingFrequency | null;
  /** Backend `price`. Decimal text, never a number. */
  pricePerUnit: string | null;
  available: boolean;
  locationName: string | null;
  geoLat: number | null;
  geoLng: number | null;
  effectiveLocationName?: string | null;
  effectiveGeoLat?: number | null;
  effectiveGeoLng?: number | null;
  distanceMeters?: number | null;
  imageUrl: string | null;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type OfferingPage = {
  offerings: Offering[];
  first: number;
  last: number;
  /** Rows received before defensive normalization dropped malformed entries. */
  receivedCount: number;
};

type OfferingTagFacet = { tag: string; count: number };

export type OfferingDiscoveryParams = {
  cursor?: string;
  perPage?: number;
  q?: string;
  tags?: readonly string[];
  tagMatch?: "any" | "all";
  facets?: boolean;
  nearby?: boolean;
  pools?: readonly { chainId: number; address: string }[];
};

export type OfferingDiscoveryPage = {
  offerings: Offering[];
  nextCursor: string | null;
  receivedCount: number;
  tagFacets: OfferingTagFacet[] | null;
};

type BackendOffering = Partial<{
  id: string | number;
  sourceId: string | number | null;
  voucherId: string | number;
  voucherAddress: string;
  voucherName: string | null;
  voucherSymbol: string | null;
  voucherUoa: string | null;
  priceInUnitOfAccount: string | number | null;
  voucherDecimals: string | number | null;
  voucherImageUrl: string | null;
  voucherLocationName: string | null;
  voucherGeoLat: string | number | null;
  voucherGeoLng: string | number | null;
  sellerAddress: string;
  commodityName: string;
  commodityType: string;
  description: string;
  quantity: string | number;
  unit: string | null;
  frequency: string | null;
  price: string | number | null;
  available: boolean;
  locationName: string | null;
  geoLat: string | number | null;
  geoLng: string | number | null;
  effectiveLocationName: string | null;
  effectiveGeoLat: string | number | null;
  effectiveGeoLng: string | number | null;
  distanceMeters: string | number | null;
  imageUrl: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}>;

type BackendOfferingPage = {
  offerings?: BackendOffering[] | null;
  first?: number;
  last?: number;
  nextCursor?: string | null;
  tagFacets?: { tag?: unknown; count?: unknown }[] | null;
};

export type OfferingsClient = ReturnType<typeof createOfferingsClient>;

/**
 * Per-read overrides for the public voucher-offerings endpoint.
 *
 * The client-level `cache` is a property of the app — the console is `no-store`
 * throughout. This is for the one query inside an app that needs the other
 * policy: a voucher owner managing their own listings cannot be served the
 * pre-mutation body that `public, max-age=60, stale-while-revalidate=300` lets
 * the browser keep, while a guest browsing the same voucher should still get the
 * shared cache. Switching the whole client would give up that cache for
 * everyone.
 */
export type OfferingReadOverrides = {
  cache?: RequestCache;
};

export type CreateOfferingsClientOptions = {
  /**
   * How the public voucher-offerings read treats the browser's HTTP cache.
   * Same contract as CreateMarketClientOptions: absent honours the endpoint's
   * `max-age`, `"no-store"` is for a console that must not show a stale record
   * beside a fresh one. The pool route is already `no-store` and unaffected.
   */
  cache?: RequestCache;
};

export function createOfferingsClient(
  http: HttpClient,
  options: CreateOfferingsClientOptions = {},
) {
  const cachePolicy = options.cache ? { cache: options.cache } : {};

  async function offeringItem(path: string, init: RequestInit): Promise<Offering> {
    const result = await http.request<{ offering?: BackendOffering | null }>(path, init);
    const offering = result.offering ? normalizeOffering(result.offering) : null;
    if (!offering) {
      // A 2xx whose body does not carry a usable offering is a contract
      // violation, not an empty result. Returning null here would make every
      // caller re-derive that distinction.
      throw new BackendApiError(
        NO_HTTP_STATUS,
        "The server returned no usable offering",
        undefined,
        {
          kind: "protocol",
        },
      );
    }
    return offering;
  }

  async function offeringPage(path: string, init: RequestInit): Promise<OfferingPage> {
    const result = await http.request<BackendOfferingPage>(path, init);
    const received = result.offerings ?? [];
    return {
      offerings: received.map(normalizeOffering).filter(isPresent),
      first: normalizeNumber(result.first) ?? 0,
      last: normalizeNumber(result.last) ?? 0,
      receivedCount: received.length,
    };
  }

  return {
    async getOfferings(
      params: OfferingDiscoveryParams,
      signal?: AbortSignal,
    ): Promise<OfferingDiscoveryPage> {
      const query = formatOfferingDiscoveryQuery(params);
      const result = await http.request<BackendOfferingPage>(`/api/v2/offerings?${query}`, {
        method: "GET",
        credentials: params.nearby ? "include" : "omit",
        signal,
        ...cachePolicy,
        ...(params.nearby ? { cache: "no-store" as const } : {}),
      });
      const received = result.offerings ?? [];
      return {
        offerings: received.map(normalizeOffering).filter(isPresent),
        nextCursor: typeof result.nextCursor === "string" ? result.nextCursor : null,
        receivedCount: received.length,
        tagFacets: result.tagFacets
          ? result.tagFacets.map(normalizeOfferingTagFacet).filter(isPresent)
          : null,
      };
    },
    /**
     * One voucher's offerings. Public and representation-invariant, so it sends
     * no cookie and by default leaves the browser cache to honour the endpoint's
     * `max-age`. A caller that cannot tolerate that passes `cache`.
     */
    async getVoucherOfferings(
      voucherAddress: string,
      params: CursorParams,
      signal?: AbortSignal,
      overrides: OfferingReadOverrides = {},
    ): Promise<OfferingPage> {
      return offeringPage(
        `/api/v2/vouchers/${encodeURIComponent(voucherAddress)}/offerings${formatCursorQuery(params)}`,
        {
          method: "GET",
          credentials: "omit",
          signal,
          ...cachePolicy,
          ...(overrides.cache ? { cache: overrides.cache } : {}),
        },
      );
    },

    /**
     * Every offering backed by a voucher a pool allows.
     *
     * This is a public browse endpoint. It remains `no-store` because pool
     * membership can change on-chain independently of the offering record.
     */
    async getPoolOfferings(
      poolAddress: string,
      params: CursorParams,
      signal?: AbortSignal,
    ): Promise<OfferingPage> {
      return offeringPage(
        `/api/v2/pools/${encodeURIComponent(poolAddress)}/offerings${formatCursorQuery(params)}`,
        { method: "GET", credentials: "omit", cache: "no-store", signal },
      );
    },

    /**
     * One offering under its voucher. Public, and filtered exactly like the list:
     * an unlisted row or a retired voucher is a 404, not a readable object.
     */
    async getVoucherOffering(
      voucherAddress: string,
      id: string,
      signal?: AbortSignal,
      overrides: OfferingReadOverrides = {},
    ): Promise<Offering> {
      return offeringItem(offeringItemPath(voucherAddress, id), {
        method: "GET",
        credentials: "omit",
        signal,
        ...cachePolicy,
        ...(overrides.cache ? { cache: overrides.cache } : {}),
      });
    },

    /**
     * Publishes an offering against a voucher the caller owns.
     *
     * Cookies, not the storage bearer token: only the multipart upload talks to
     * storage-server. The response is the row as saved, so a caller learns how
     * its decimal and trimmed text were stored without a refetch that the public
     * endpoint's own cache could answer stale.
     */
    async createVoucherOffering(
      voucherAddress: string,
      input: OfferingWrite,
      signal?: AbortSignal,
    ): Promise<Offering> {
      return offeringItem(`/api/v2/vouchers/${encodeURIComponent(voucherAddress)}/offerings`, {
        method: "POST",
        body: JSON.stringify(toOfferingWriteBody(input)),
        cache: "no-store",
        signal,
      });
    },

    /**
     * Assign-all replacement. There is no PATCH: every field the form shows is
     * sent every time, so a cleared photo and a forgotten key cannot be confused.
     */
    async updateVoucherOffering(
      voucherAddress: string,
      id: string,
      input: OfferingWrite,
      signal?: AbortSignal,
    ): Promise<Offering> {
      return offeringItem(offeringItemPath(voucherAddress, id), {
        method: "PUT",
        body: JSON.stringify(toOfferingWriteBody(input)),
        cache: "no-store",
        signal,
      });
    },

    /**
     * Unlists an offering and returns the id the server unlisted.
     *
     * The row is kept — public reads already filter it out — so the Sarafu
     * provenance a later import reconciles against survives. The stored photo is
     * not deleted either: bucket objects are immutable and storage has no delete.
     */
    async deleteVoucherOffering(
      voucherAddress: string,
      id: string,
      signal?: AbortSignal,
    ): Promise<string> {
      const result = await http.request<{ id?: string | number }>(
        offeringItemPath(voucherAddress, id),
        { method: "DELETE", cache: "no-store", signal },
      );
      return normalizeID(result.id) ?? id;
    },
  };
}

function offeringItemPath(voucherAddress: string, id: string): string {
  return `/api/v2/vouchers/${encodeURIComponent(voucherAddress)}/offerings/${encodeURIComponent(id)}`;
}

function normalizeOffering(offering: BackendOffering): Offering | null {
  const voucherAddress = normalizeHex(offering.voucherAddress);
  const sellerAddress = normalizeHex(offering.sellerAddress);
  if (
    !voucherAddress ||
    !sellerAddress ||
    offering.id === undefined ||
    offering.voucherId === undefined
  ) {
    return null;
  }
  const unitLabel = normalizeText(offering.unit);
  return {
    id: String(offering.id),
    sourceId: normalizeID(offering.sourceId),
    voucherId: String(offering.voucherId),
    voucherAddress,
    voucherName: normalizeText(offering.voucherName),
    voucherSymbol: normalizeText(offering.voucherSymbol),
    voucherUoa: normalizeText(offering.voucherUoa),
    priceInUnitOfAccount: normalizeNumericText(offering.priceInUnitOfAccount),
    voucherDecimals: normalizeNumber(offering.voucherDecimals),
    voucherImageUrl: normalizeImageUrl(offering.voucherImageUrl),
    voucherLocationName: normalizeText(offering.voucherLocationName),
    voucherGeoLat: normalizeNumber(offering.voucherGeoLat),
    voucherGeoLng: normalizeNumber(offering.voucherGeoLng),
    sellerAddress,
    name: normalizeText(offering.commodityName) ?? "Offering",
    commodityType: isOfferingCommodityType(offering.commodityType) ? offering.commodityType : null,
    description: normalizeText(offering.description) ?? "",
    quantity: normalizeNumericText(offering.quantity) ?? "0",
    unit: unitLabel,
    unitLabel,
    frequency: normalizeOfferingFrequency(offering.frequency),
    pricePerUnit: normalizeNumericText(offering.price),
    available: offering.available !== false,
    locationName: normalizeText(offering.locationName),
    geoLat: normalizeNumber(offering.geoLat),
    geoLng: normalizeNumber(offering.geoLng),
    effectiveLocationName:
      normalizeText(offering.effectiveLocationName) ??
      normalizeText(offering.locationName) ??
      normalizeText(offering.voucherLocationName),
    effectiveGeoLat:
      normalizeNumber(offering.effectiveGeoLat) ??
      normalizeNumber(offering.geoLat) ??
      normalizeNumber(offering.voucherGeoLat),
    effectiveGeoLng:
      normalizeNumber(offering.effectiveGeoLng) ??
      normalizeNumber(offering.geoLng) ??
      normalizeNumber(offering.voucherGeoLng),
    distanceMeters: normalizeNumber(offering.distanceMeters),
    imageUrl: normalizeImageUrl(offering.imageUrl),
    tags: normalizeStringArray(offering.tags),
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
  };
}

function formatOfferingDiscoveryQuery(params: OfferingDiscoveryParams): string {
  const query = new URLSearchParams({ perPage: String(params.perPage ?? 20) });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.tags && params.tags.length > 0) query.set("tags", params.tags.join(","));
  if (params.tagMatch === "all" && (params.tags?.length ?? 0) > 1) query.set("tagMatch", "all");
  if (params.facets) query.set("facets", "true");
  if (params.nearby) query.set("nearby", "true");
  if (params.pools && params.pools.length > 0) {
    query.set(
      "pools",
      params.pools.map((pool) => `${pool.chainId}:${pool.address.toLowerCase()}`).join(","),
    );
  }
  return query.toString();
}

function normalizeOfferingTagFacet(value: {
  tag?: unknown;
  count?: unknown;
}): OfferingTagFacet | null {
  const tag = normalizeText(value.tag);
  const count = normalizeNumber(value.count);
  return tag && count !== null && count >= 0 ? { tag, count } : null;
}

/**
 * The app model translated back to the wire the backend reads.
 *
 * One direction only, and in one place: nothing else in either app should know
 * that `pricePerUnit` is called `price` on the network. An absent photo is sent
 * as an explicit `null` rather than omitted, because `PUT` is assign-all and a
 * missing key would be indistinguishable from a client that forgot the field.
 *
 * The schema is re-run here rather than trusted to have run in the form, and that
 * is not belt-and-braces. TanStack Form validates against a Standard Schema but
 * submits the caller's own values, so `.trim()` in the schema shapes the *error*
 * and not the value — a name typed with trailing spaces validates and then travels
 * padded. Normalizing at the one place every write passes through means neither
 * app has to remember, and the text that was validated is the text that is sent.
 */
function toOfferingWriteBody(input: OfferingWrite) {
  const normalized = offeringWriteSchema.parse(input);
  return {
    commodityName: normalized.name,
    commodityType: normalized.commodityType,
    description: normalized.description,
    unit: normalized.unit,
    price: normalized.pricePerUnit,
    imageUrl: normalized.imageUrl,
  };
}

function normalizeOfferingFrequency(value: unknown): OfferingFrequency | null {
  const frequency = normalizeText(value)?.toLowerCase();
  return frequency === "day" ||
    frequency === "week" ||
    frequency === "month" ||
    frequency === "year"
    ? frequency
    : null;
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
