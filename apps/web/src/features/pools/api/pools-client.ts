import {
  type CatalogFilter,
  type VoucherRef,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";

import { apiFetch } from "#/features/auth/api/client";
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
} from "#/lib/api-normalize";

export type { CursorParams };

export type PoolTagFacet = {
  tag: string;
  count: number;
};

export type PoolVoucherFacet = VoucherRef & {
  name: string;
  symbol: string;
  count: number;
  placeholder?: boolean;
};

export type FilteredPoolsParams = CursorParams & {
  filter: CatalogFilter;
  facets?: boolean;
};

export type FilteredPoolPage = UserPoolPage & {
  tagFacets: PoolTagFacet[] | null;
  voucherFacets: PoolVoucherFacet[] | null;
};

export type UserPool = {
  id: string;
  chainId: number | null;
  address: HexAddress;
  name: string;
  symbol: string;
  ownerAddress: HexAddress | null;
  feePpm: number | null;
  feeAddress: HexAddress | null;
  tokenRegistryAddress: HexAddress | null;
  limiterAddress: HexAddress | null;
  quoterAddress: HexAddress | null;
  feePolicyAddress: HexAddress | null;
  protocolFeeControllerAddress: HexAddress | null;
  feesDecoupled: boolean;
  decimals: number | null;
  description: string;
  unitOfAccount: string | null;
  locationName: string | null;
  geoLat: number | null;
  geoLng: number | null;
  email: string | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  terms: string | null;
  defaultVoucherId: string | null;
  voucherCount: number;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type PoolVoucher = {
  id: string;
  chainId: number | null;
  name: string;
  description: string;
  symbol: string;
  tokenAddress: HexAddress;
  decimals: number | null;
  ownerAddress: HexAddress | null;
  voucherType: string | null;
  voucherUoa: string | null;
  voucherValue: string | null;
  locationName: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  active: boolean;
  internal: boolean;
  isAllowed: boolean;
  tokenLimit: string | null;
  oracleFeedId: string | null;
  oracleName: string | null;
  oracleAddress: HexAddress | null;
  offerCount: number;
  availableOfferCount: number;
  tags: string[];
  syncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UserPoolPage = {
  pools: UserPool[];
  first?: number;
  last?: number;
  receivedCount: number;
};

export type PoolVoucherPage = {
  vouchers: PoolVoucher[];
  first?: number;
  last?: number;
};

type BackendPool = Partial<{
  id: string | number;
  chainId: string | number;
  address: string;
  name: string;
  symbol: string;
  ownerAddress: string | null;
  feePpm: string | number | null;
  feeAddress: string | null;
  description: string | null;
  imageUrl: string | null;
  image: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  tags: string[] | null;
  tokenRegistryAddress: string | null;
  limiterAddress: string | null;
  feePolicyAddress: string | null;
  protocolFeeControllerAddress: string | null;
  quoterAddress: string | null;
  feesDecoupled: boolean | null;
  decimals: string | number | null;
  unitOfAccount: string | null;
  locationName: string | null;
  geoLat: string | number | null;
  geoLng: string | number | null;
  email: string | null;
  website: string | null;
  phone: string | null;
  terms: string | null;
  defaultVoucherId: string | number | null;
  voucherCount: string | number | null;
  createdAt: string;
  updatedAt: string;
}>;

type BackendPoolVoucher = Partial<{
  id: string | number;
  chainId: string | number;
  address: string;
  name: string | null;
  description: string | null;
  symbol: string | null;
  decimals: string | number | null;
  ownerAddress: string | null;
  voucherType: string | null;
  voucherUoa: string | null;
  voucherValue: string | number | null;
  locationName: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  active: boolean;
  internal: boolean;
  isAllowed: boolean;
  tokenLimit: string | number | null;
  oracleFeedId: string | number | null;
  oracleName: string | null;
  oracleAddress: string | null;
  offerCount: string | number | null;
  availableOfferCount: string | number | null;
  tags: string[] | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}>;

type BackendFilteredPoolPage = BackendPoolPage & {
  tagFacets?: { tag?: unknown; count?: unknown }[] | null;
  voucherFacets?: BackendVoucherFacet[] | null;
};

type BackendVoucherFacet = Partial<{
  chainId: string | number;
  address: string;
  name: string;
  symbol: string;
  count: string | number;
}>;

type BackendPoolPage = {
  pools?: BackendPool[] | null;
  first?: number;
  last?: number;
};

type BackendPoolVoucherPage = {
  vouchers?: BackendPoolVoucher[] | null;
  first?: number;
  last?: number;
};

type BackendPoolEnvelope = { pool?: BackendPool | null } & BackendPool;

function poolReadRequest(signal?: AbortSignal): RequestInit {
  return { method: "GET", cache: "no-store", signal };
}

export async function getPools(params: CursorParams, signal?: AbortSignal): Promise<UserPoolPage> {
  const result = await apiFetch<BackendPoolPage>(
    `/api/v2/pools${formatCursorQuery(params)}`,
    poolReadRequest(signal),
  );
  const received = result.pools ?? [];
  return {
    ...result,
    pools: received.map(normalizeUserPool).filter(isPresent),
    receivedCount: received.length,
  };
}

export async function getFilteredPools(
  { filter, facets, ...cursor }: FilteredPoolsParams,
  signal?: AbortSignal,
): Promise<FilteredPoolPage> {
  const search = new URLSearchParams(formatCursorQuery(cursor));
  if (filter.term !== "") search.set("q", filter.term);
  if (filter.tags.length > 0) search.set("tags", filter.tags.join(","));
  if (filter.tags.length > 1 && filter.tagMatch === "all") search.set("tagMatch", "all");
  if (filter.vouchers.length > 0) {
    search.set("vouchers", filter.vouchers.map(serializeVoucherRef).join(","));
  }
  if (filter.vouchers.length > 1 && filter.voucherMatch === "all") {
    search.set("voucherMatch", "all");
  }
  if (facets) search.set("facets", "true");

  const result = await apiFetch<BackendFilteredPoolPage>(
    `/api/v2/pools?${search.toString()}`,
    poolReadRequest(signal),
  );

  const received = result.pools ?? [];
  return {
    ...result,
    pools: received.map(normalizeUserPool).filter(isPresent),
    receivedCount: received.length,
    tagFacets: result.tagFacets
      ? result.tagFacets.map(normalizePoolTagFacet).filter(isPresent)
      : null,
    voucherFacets: result.voucherFacets
      ? result.voucherFacets.map(normalizePoolVoucherFacet).filter(isPresent)
      : null,
  };
}

function normalizePoolVoucherFacet(facet: BackendVoucherFacet): PoolVoucherFacet | null {
  const chainId = normalizeNumber(facet.chainId);
  const address = normalizeHex(facet.address);
  const name = normalizeText(facet.name);
  const symbol = normalizeText(facet.symbol);
  const count = normalizeNumber(facet.count);
  if (
    chainId === null ||
    chainId <= 0 ||
    !address ||
    !name ||
    !symbol ||
    count === null ||
    count < 0
  ) {
    return null;
  }
  return { chainId, address, name, symbol, count };
}

function normalizePoolTagFacet(facet: { tag?: unknown; count?: unknown }): PoolTagFacet | null {
  const tag = normalizeText(facet.tag);
  const count = normalizeNumber(facet.count);
  if (!tag || count === null || count < 0) return null;
  return { tag, count };
}

export async function getPoolByAddress(address: string, signal?: AbortSignal): Promise<UserPool> {
  const result = await apiFetch<BackendPoolEnvelope>(
    `/api/v2/pools/${encodeURIComponent(address)}`,
    poolReadRequest(signal),
  );
  const pool = normalizeUserPool(result.pool ?? result);
  if (!pool) throw new Error("Pool response did not include a valid address.");
  return pool;
}

export async function getPoolVouchers(
  poolAddress: string,
  params: CursorParams,
  signal?: AbortSignal,
): Promise<PoolVoucherPage> {
  const result = await apiFetch<BackendPoolVoucherPage>(
    `/api/v2/pools/${encodeURIComponent(poolAddress)}/vouchers${formatCursorQuery(params)}`,
    poolReadRequest(signal),
  );
  return {
    ...result,
    vouchers: (result.vouchers ?? []).map(normalizePoolVoucher).filter(isPresent),
  };
}

export function normalizeUserPool(pool: BackendPool): UserPool | null {
  const address = normalizeHex(pool.address);
  if (!address) return null;
  const name = normalizeText(pool.name) ?? "Community Pool";
  const symbol = normalizeText(pool.symbol) ?? "POOL";
  return {
    id: String(pool.id ?? address),
    chainId: normalizeNumber(pool.chainId),
    address,
    name,
    symbol,
    ownerAddress: normalizeHex(pool.ownerAddress),
    feePpm: normalizeNumber(pool.feePpm),
    feeAddress: normalizeHex(pool.feeAddress),
    tokenRegistryAddress: normalizeHex(pool.tokenRegistryAddress),
    limiterAddress: normalizeHex(pool.limiterAddress),
    quoterAddress: normalizeHex(pool.quoterAddress),
    feePolicyAddress: normalizeHex(pool.feePolicyAddress),
    protocolFeeControllerAddress: normalizeHex(pool.protocolFeeControllerAddress),
    feesDecoupled: Boolean(pool.feesDecoupled),
    decimals: normalizeNumber(pool.decimals),
    description: normalizeText(pool.description) ?? `${name} community liquidity pool`,
    unitOfAccount: normalizeText(pool.unitOfAccount),
    locationName: normalizeText(pool.locationName),
    geoLat: normalizeNumber(pool.geoLat),
    geoLng: normalizeNumber(pool.geoLng),
    email: normalizeText(pool.email),
    website: normalizeText(pool.website),
    phone: normalizeText(pool.phone),
    imageUrl: normalizeText(pool.imageUrl ?? pool.logoUrl ?? pool.image),
    bannerUrl: normalizeText(pool.bannerUrl),
    terms: normalizeText(pool.terms),
    defaultVoucherId: normalizeID(pool.defaultVoucherId),
    voucherCount: normalizeNumber(pool.voucherCount) ?? 0,
    tags: normalizeStringArray(pool.tags),
    createdAt: pool.createdAt,
    updatedAt: pool.updatedAt,
  };
}

function normalizePoolVoucher(voucher: BackendPoolVoucher): PoolVoucher | null {
  const tokenAddress = normalizeHex(voucher.address);
  if (!tokenAddress) return null;
  const name = normalizeText(voucher.name) ?? "Community Voucher";
  const symbol = normalizeText(voucher.symbol) ?? "VOUCHER";
  return {
    id: String(voucher.id ?? tokenAddress),
    chainId: normalizeNumber(voucher.chainId),
    name,
    description: normalizeText(voucher.description) ?? name,
    symbol,
    tokenAddress,
    decimals: normalizeNumber(voucher.decimals),
    ownerAddress: normalizeHex(voucher.ownerAddress),
    voucherType: normalizeText(voucher.voucherType),
    voucherUoa: normalizeText(voucher.voucherUoa),
    voucherValue: normalizeNumericText(voucher.voucherValue),
    locationName: normalizeText(voucher.locationName),
    iconUrl: normalizeText(voucher.iconUrl),
    bannerUrl: normalizeText(voucher.bannerUrl),
    active: voucher.active !== false,
    internal: Boolean(voucher.internal),
    isAllowed: voucher.isAllowed !== false,
    tokenLimit: normalizeNumericText(voucher.tokenLimit),
    oracleFeedId: normalizeID(voucher.oracleFeedId),
    oracleName: normalizeText(voucher.oracleName),
    oracleAddress: normalizeHex(voucher.oracleAddress),
    offerCount: normalizeNumber(voucher.offerCount) ?? 0,
    availableOfferCount: normalizeNumber(voucher.availableOfferCount) ?? 0,
    tags: normalizeStringArray(voucher.tags),
    syncedAt: voucher.syncedAt,
    createdAt: voucher.createdAt,
    updatedAt: voucher.updatedAt,
  };
}
