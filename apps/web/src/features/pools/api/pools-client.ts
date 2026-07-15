import { apiFetch } from "#/features/auth/api/client";

export type HexAddress = `0x${string}`;

export type UserPool = {
  id: string;
  address: HexAddress;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  tags: string[];
  tokenRegistryAddress: HexAddress | null;
  feePolicyAddress: HexAddress | null;
  quoterAddress: HexAddress | null;
  feesDecoupled: boolean;
  locationName: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type UserPoolPage = {
  pools: UserPool[];
  first?: number;
  last?: number;
};

export type UserPoolsCursorParams = {
  perPage: number;
  cursor?: number;
  next?: boolean;
};

type BackendPool = Partial<{
  id: string | number;
  address: string;
  name: string;
  symbol: string;
  description: string | null;
  imageUrl: string | null;
  image: string | null;
  logoUrl: string | null;
  tags: string[] | null;
  tokenRegistryAddress: string | null;
  feePolicyAddress: string | null;
  quoterAddress: string | null;
  feesDecoupled: boolean | null;
  locationName: string | null;
  createdAt: string;
  updatedAt: string;
}>;

type BackendPoolPage = {
  pools?: BackendPool[] | null;
  first?: number;
  last?: number;
};

type BackendPoolEnvelope = { pool?: BackendPool | null } & BackendPool;

const POOL_READ_REQUEST: RequestInit = {
  method: "GET",
  cache: "no-store",
};

export async function getUserPools(params: UserPoolsCursorParams): Promise<UserPoolPage> {
  const result = await apiFetch<BackendPoolPage>(
    `/api/v2/users/me/pools${formatCursorQuery(params)}`,
    POOL_READ_REQUEST,
  );
  return {
    ...result,
    pools: (result.pools ?? [])
      .map(normalizeUserPool)
      .filter((pool): pool is UserPool => pool !== null),
  };
}

export async function getUserPoolByAddress(address: string): Promise<UserPool> {
  const result = await apiFetch<BackendPoolEnvelope>(
    `/api/v2/users/me/pools/${address}`,
    POOL_READ_REQUEST,
  );
  const pool = normalizeUserPool(result.pool ?? result);
  if (!pool) throw new Error("Pool response did not include a valid address.");
  return pool;
}

export function normalizeUserPool(pool: BackendPool): UserPool | null {
  const address = normalizeHex(pool.address);
  if (!address) return null;
  const name = normalizeText(pool.name) ?? "Community Pool";
  const symbol = normalizeText(pool.symbol) ?? "POOL";
  return {
    id: String(pool.id ?? address),
    address,
    name,
    symbol,
    description: normalizeText(pool.description) ?? `${name} community liquidity pool`,
    imageUrl: normalizeText(pool.imageUrl ?? pool.logoUrl ?? pool.image) ?? null,
    tags: Array.isArray(pool.tags)
      ? pool.tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)
      : [],
    tokenRegistryAddress: normalizeHex(pool.tokenRegistryAddress),
    feePolicyAddress: normalizeHex(pool.feePolicyAddress),
    quoterAddress: normalizeHex(pool.quoterAddress),
    feesDecoupled: Boolean(pool.feesDecoupled),
    locationName: normalizeText(pool.locationName) ?? null,
    createdAt: pool.createdAt,
    updatedAt: pool.updatedAt,
  };
}

function formatCursorQuery(params: UserPoolsCursorParams): string {
  const search = new URLSearchParams({ perPage: params.perPage.toString() });
  if (params.cursor !== undefined) search.set("cursor", params.cursor.toString());
  if (params.next !== undefined) search.set("next", params.next ? "true" : "false");
  return `?${search.toString()}`;
}

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeHex(value: unknown): HexAddress | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? (value as HexAddress)
    : null;
}
