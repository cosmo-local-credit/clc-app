import { apiFetch } from "#/features/auth/api/client";

export type HexAddress = `0x${string}`;

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
  frequency: string | null;
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

export type UserPoolPage = {
  pools: UserPool[];
  first?: number;
  last?: number;
};

export type PoolVoucherPage = {
  vouchers: PoolVoucher[];
  first?: number;
  last?: number;
};

export type OfferingPage = {
  offerings: Offering[];
  first?: number;
  last?: number;
};

export type CursorParams = {
  perPage: number;
  cursor?: number;
  next?: boolean;
};

export type UserPoolsCursorParams = CursorParams;

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

type BackendOfferingPage = {
  offerings?: BackendOffering[] | null;
  first?: number;
  last?: number;
};

type BackendPoolEnvelope = { pool?: BackendPool | null } & BackendPool;

const POOL_READ_REQUEST: RequestInit = {
  method: "GET",
  cache: "no-store",
};

/** Global network pool catalog (not user membership). */
export async function getPools(params: UserPoolsCursorParams): Promise<UserPoolPage> {
  const result = await apiFetch<BackendPoolPage>(
    `/api/v2/pools${formatCursorQuery(params)}`,
    POOL_READ_REQUEST,
  );
  return {
    ...result,
    pools: (result.pools ?? []).map(normalizeUserPool).filter(isPresent),
  };
}

/** Single pool with full catalog metadata. */
export async function getPoolByAddress(address: string): Promise<UserPool> {
  const result = await apiFetch<BackendPoolEnvelope>(
    `/api/v2/pools/${encodeURIComponent(address)}`,
    POOL_READ_REQUEST,
  );
  const pool = normalizeUserPool(result.pool ?? result);
  if (!pool) throw new Error("Pool response did not include a valid address.");
  return pool;
}

/** Allowed vouchers in a pool, newest catalog entries first. */
export async function getPoolVouchers(
  poolAddress: string,
  params: CursorParams,
): Promise<PoolVoucherPage> {
  const result = await apiFetch<BackendPoolVoucherPage>(
    `/api/v2/pools/${encodeURIComponent(poolAddress)}/vouchers${formatCursorQuery(params)}`,
    POOL_READ_REQUEST,
  );
  return {
    ...result,
    vouchers: (result.vouchers ?? []).map(normalizePoolVoucher).filter(isPresent),
  };
}

export async function getOfferings(params: CursorParams): Promise<OfferingPage> {
  const result = await apiFetch<BackendOfferingPage>(
    `/api/v2/offerings${formatCursorQuery(params)}`,
    POOL_READ_REQUEST,
  );
  return {
    ...result,
    offerings: (result.offerings ?? []).map(normalizeOffering).filter(isPresent),
  };
}

export async function getVoucherOfferings(
  voucherAddress: string,
  params: CursorParams,
): Promise<OfferingPage> {
  const result = await apiFetch<BackendOfferingPage>(
    `/api/v2/vouchers/${encodeURIComponent(voucherAddress)}/offerings${formatCursorQuery(params)}`,
    POOL_READ_REQUEST,
  );
  return {
    ...result,
    offerings: (result.offerings ?? []).map(normalizeOffering).filter(isPresent),
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
    frequency: normalizeText(offering.frequency),
    price: normalizeNumericText(offering.price),
    available: offering.available !== false,
    locationName: normalizeText(offering.locationName),
    geoLat: normalizeNumber(offering.geoLat),
    geoLng: normalizeNumber(offering.geoLng),
    imageUrl: normalizeText(offering.imageUrl),
    tags: normalizeStringArray(offering.tags),
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
  };
}

function formatCursorQuery(params: CursorParams): string {
  const search = new URLSearchParams({ perPage: params.perPage.toString() });
  if (params.cursor !== undefined) search.set("cursor", params.cursor.toString());
  if (params.next !== undefined) search.set("next", params.next ? "true" : "false");
  return `?${search.toString()}`;
}

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumericText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return normalizeText(value);
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeID(value: unknown): string | null {
  return typeof value === "number" || (typeof value === "string" && value.length > 0)
    ? String(value)
    : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function normalizeHex(value: unknown): HexAddress | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? (value as HexAddress)
    : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
