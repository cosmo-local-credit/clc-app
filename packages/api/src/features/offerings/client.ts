import { apiFetch } from "../auth/client";
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

export type Offering = {
  id: string;
  sourceId: string | null;
  voucherId: string;
  voucherAddress: HexAddress;
  voucherName: string | null;
  voucherSymbol: string | null;
  voucherDecimals: number | null;
  sellerAddress: HexAddress;
  commodityName: string;
  commodityType: string;
  description: string;
  quantity: string;
  unit: string | null;
  frequency: OfferingFrequency | null;
  price: string | null;
  available: boolean;
  locationName: string | null;
  geoLat: number | null;
  geoLng: number | null;
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

type BackendOffering = Partial<{
  id: string | number;
  sourceId: string | number | null;
  voucherId: string | number;
  voucherAddress: string;
  voucherName: string | null;
  voucherSymbol: string | null;
  voucherDecimals: string | number | null;
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
  imageUrl: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}>;

type BackendOfferingPage = {
  offerings?: BackendOffering[] | null;
  first?: number;
  last?: number;
};

/**
 * One voucher's offerings. Public and representation-invariant, so it sends no
 * cookie and leaves the browser cache to honour the endpoint's `max-age`.
 */
export async function getVoucherOfferings(
  voucherAddress: string,
  params: CursorParams,
  signal?: AbortSignal,
): Promise<OfferingPage> {
  return offeringPage(
    `/api/v2/vouchers/${encodeURIComponent(voucherAddress)}/offerings${formatCursorQuery(params)}`,
    { method: "GET", credentials: "omit", signal },
  );
}

/**
 * Every offering backed by a voucher a pool allows.
 *
 * Unlike the voucher route this one is authenticated, matching the rest of
 * `/api/v2/pools/*` and the pool screen's own session requirement — hence the
 * session cookie and `no-store` instead of a shared public cache.
 */
export async function getPoolOfferings(
  poolAddress: string,
  params: CursorParams,
  signal?: AbortSignal,
): Promise<OfferingPage> {
  return offeringPage(
    `/api/v2/pools/${encodeURIComponent(poolAddress)}/offerings${formatCursorQuery(params)}`,
    { method: "GET", cache: "no-store", signal },
  );
}

async function offeringPage(path: string, init: RequestInit): Promise<OfferingPage> {
  const result = await apiFetch<BackendOfferingPage>(path, init);
  const received = result.offerings ?? [];
  return {
    offerings: received.map(normalizeOffering).filter(isPresent),
    first: normalizeNumber(result.first) ?? 0,
    last: normalizeNumber(result.last) ?? 0,
    receivedCount: received.length,
  };
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
  return {
    id: String(offering.id),
    sourceId: normalizeID(offering.sourceId),
    voucherId: String(offering.voucherId),
    voucherAddress,
    voucherName: normalizeText(offering.voucherName),
    voucherSymbol: normalizeText(offering.voucherSymbol),
    voucherDecimals: normalizeNumber(offering.voucherDecimals),
    sellerAddress,
    commodityName: normalizeText(offering.commodityName) ?? "Offering",
    commodityType: normalizeText(offering.commodityType) ?? "UNKNOWN",
    description: normalizeText(offering.description) ?? "",
    quantity: normalizeNumericText(offering.quantity) ?? "0",
    unit: normalizeText(offering.unit),
    frequency: normalizeOfferingFrequency(offering.frequency),
    price: normalizeNumericText(offering.price),
    available: offering.available !== false,
    locationName: normalizeText(offering.locationName),
    geoLat: normalizeNumber(offering.geoLat),
    geoLng: normalizeNumber(offering.geoLng),
    imageUrl: normalizeImageUrl(offering.imageUrl),
    tags: normalizeStringArray(offering.tags),
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
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
