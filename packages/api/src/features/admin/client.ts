/**
 * The superadmin-only endpoints under /api/v2/admin.
 *
 * clc-core gates the whole group behind `requireSuperAdmin`, so every call here
 * fails with 403 for anyone else. That is the authorization boundary; the admin
 * console's session gate only decides what to render.
 *
 * **`/admin/users` pages and searches at the backend.** It answers one cursor page
 * of at most `perPage` accounts with `first`/`last`, and `?q=` filters across the
 * whole directory rather than the page. Callers must page it — presenting one page
 * as the directory is how an admin total silently under-reports.
 *
 * `q` carries the catalog's term rules, enforced by clc-core: under two characters
 * or over sixty-four is a 400, not an unfiltered list. Normalize with
 * `parseCatalogFilter` from @clc/core before sending, as the catalog surfaces do.
 *
 * `?status=` is one of PENDING, APPROVED or REJECTED. It is sent only when set.
 *
 * `/admin/tokens` and `/admin/pools` stay unpaginated and are not called here.
 * `/admin/deployments` is called with `perPage`. A server that already pages
 * answers `first`/`last`; a server that still returns the whole history is paged
 * here, so the console never renders the dump as one table.
 *
 * Dashboard aggregates live under `/admin/dashboard`, a separate group from
 * the user/token mutations. Transaction pages live under `/admin/transactions`.
 */

import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import { getAddress } from "viem";

import type { HttpClient } from "../../client/http-client";
import type { CursorParams, HexAddress } from "../../lib/api-normalize";
import {
  formatCursorQuery,
  isPresent,
  normalizeChainId,
  normalizeCoordinate,
  normalizeHex,
  normalizeNumber,
  normalizeRawAmount,
  normalizeText,
} from "../../lib/api-normalize";
import {
  type BackendMarketVoucherDetail,
  type MarketVoucherDetail,
  type MarketVoucherKind,
  normalizeMarketVoucherDetail,
  serializeVoucherProfileUpdate,
  type VoucherProfileUpdate,
} from "../market/client";
import {
  normalizeUserPool,
  type PoolProfileUpdate,
  serializePoolProfileUpdate,
  type UserPool,
  type UserPoolPage,
} from "../pools/client";

export type AdminUser = {
  id: number;
  ethereumAddress: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  role: string;
  status: string;
  maxPools: number;
  maxTokens: number;
  maxCatalogs: number;
  maxOffers: number;
  maxWants: number;
  createdAt: string;
  updatedAt: string;
  /** The account's chosen ISO 4217 currency. Null for profiles created before it existed. */
  preferredCurrency?: string | null;
  /** A short, optional account description. */
  bio?: string | null;
  /** The account's optional public website. */
  website?: string | null;
  /** The account's profile image. Null when it has none. */
  avatarUrl: string | null;
  /** The account's saved place. Null when it has none. */
  locationName: string | null;
  /**
   * Coordinates, normalized as a pair: clc-core stores them under a
   * both-or-neither constraint, so a lone latitude is a place nobody can point
   * at and is reported as no location at all.
   */
  geoLat: number | null;
  geoLng: number | null;
};

/**
 * The location keys are omitted from the response rather than sent as null, so
 * every consumer would otherwise have to know the difference between "absent"
 * and "empty".
 */
type BackendAdminUser = Omit<
  AdminUser,
  "preferredCurrency" | "bio" | "website" | "avatarUrl" | "locationName" | "geoLat" | "geoLng"
> &
  Partial<{
    preferredCurrency: string | null;
    bio: string | null;
    website: string | null;
    avatarUrl: string | null;
    locationName: string | null;
    geoLat: number | null;
    geoLng: number | null;
  }>;

export type AdminUserLimits = {
  maxPools?: number;
  maxTokens?: number;
  maxCatalogs?: number;
  maxOffers?: number;
  maxWants?: number;
};

/**
 * The fields `PUT /admin/users/:address/profile` accepts.
 *
 * **The first four identity fields are required on every request, including one that only means
 * to move a pin.** clc-core's `update-user-profile` statement assigns them
 * unconditionally (`SET name = $2, email = NULLIF($3, ''), …`), so a body that
 * omits `name` stores an empty name. Only the location keys are COALESCEd, which
 * is why they are the optional ones: omit them to keep the stored place, send all
 * three to move it.
 *
 * A corollary worth knowing before someone tries: this endpoint cannot clear a
 * location. NULL means "leave it alone" to that statement.
 *
 * Approval state, role and limits are absent because the endpoint does not accept
 * them — they have their own.
 */
export type AdminUserProfile = {
  name: string;
  email: string;
  phone: string;
  country: string;
  /** ISO 4217 code. Omit only to preserve a legacy profile with no preference. */
  preferredCurrency?: string;
  /** Send an empty string to remove the bio. */
  bio?: string;
  /** Send an empty string to remove the website. */
  website?: string;
  /** Sent as a set, or not at all: a label and its coordinates travel together. */
  locationName?: string;
  geoLat?: number;
  geoLng?: number;
  /**
   * The stored image is left alone when both keys are omitted — the same rule the
   * location keys follow, so a client that knows nothing about avatars cannot
   * remove one. Send `avatarUrl` to replace it, `clearAvatar` to remove it, never
   * both: clc-core rejects the pair rather than choosing.
   */
  avatarUrl?: string;
  clearAvatar?: boolean;
};

export type AdminUserStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AdminUserParams = {
  perPage: number;
  cursor?: number;
  next?: boolean;
  /** Matched by the backend against name, email, phone and address. */
  q?: string;
  /** One approval state. Omitted means every state. */
  status?: AdminUserStatus;
};

export type AdminUserPage = {
  users: Array<AdminUser>;
  first: number;
  last: number;
  receivedCount: number;
};

/**
 * The figures behind one account.
 *
 * The three chain figures are null when clc-core cannot reach the federation
 * database. Null rather than zero: a caller must be able to tell "none" from "no
 * answer", and a zero reads as the first.
 */
export type AdminAccountStats = {
  reports: number;
  vouchers: number;
  poolMemberships: number;
  transactions: number | null;
  swaps: number | null;
  partners: number | null;
};

type AdminStatsRange = {
  preset: string;
  since: string;
  until: string;
  bucket: string;
};

type AdminCatalogPoint = {
  t: string;
  reports: number;
  vouchers: number;
  pools: number;
};

type AdminTransactionPoint = {
  t: string;
  transactions: number;
};

type AdminStats = {
  range: AdminStatsRange;
  pools: number;
  vouchers: number;
  reports: number;
  accounts: number;
  /** Null when the federation DB could not be counted. */
  transactions: number | null;
  catalogSeries: Array<AdminCatalogPoint>;
  transactionSeries: Array<AdminTransactionPoint>;
};

export type AdminStatsParams = {
  range: string;
  since?: string;
  until?: string;
};

/**
 * Chain activity, in the two shapes clc-core serves it, plus what this service
 * signed.
 *
 * Three resources rather than one filtered list, because they answer three
 * questions. A voucher movement has a sender, a recipient and one amount; a pool
 * operation has an initiator, two vouchers, two amounts and a fee; an OTX is a
 * transaction _we_ signed and may never have reached the chain at all. Folding
 * them into one row type would leave most of every row empty, and would let a
 * caller read an OTX status as if it were a chain receipt.
 *
 * All three page by the same cursor contract as the catalog endpoints —
 * `perPage` / `cursor` / `next`, answering with `first` and `last`.
 */

export const ADMIN_VOUCHER_TX_TYPES = ["transfer", "mint", "burn"] as const;

export type AdminVoucherTxType = (typeof ADMIN_VOUCHER_TX_TYPES)[number];

export const ADMIN_POOL_TX_TYPES = ["swap", "deposit"] as const;

export type AdminPoolTxType = (typeof ADMIN_POOL_TX_TYPES)[number];

/** The OTX kinds clc-core's `otx_tx_type` table holds, in its own order. */
export const ADMIN_OTX_TYPES = [
  "TOKEN_PROXY_DEPLOY",
  "POOL_DEPLOY_STEP",
  "POOL_PROXY_DEPLOY",
  "POOL_TOKEN_INDEX_DEPLOY",
  "POOL_LIMITER_DEPLOY",
  "POOL_FEE_POLICY_DEPLOY",
  "POOL_ORACLE_QUOTER_DEPLOY",
  "POOL_RELATIVE_QUOTER_DEPLOY",
  "PROXY_UPGRADE",
  "RELAY_DELEGATE",
  "RELAY_EXEC",
  "RELAY_DELEGATE_EXEC",
  "ACCOUNT_REGISTER",
] as const;

export type AdminOTXType = (typeof ADMIN_OTX_TYPES)[number];

/**
 * `dispatch_status_type`: the lifecycle first, then the six ways a dispatch
 * fails to reach the chain. SUCCESS and REVERTED are the only two that mean the
 * transaction was mined.
 */
export const ADMIN_DISPATCH_STATUSES = [
  "PENDING",
  "IN_NETWORK",
  "SUCCESS",
  "REVERTED",
  "LOW_NONCE",
  "NO_GAS",
  "LOW_GAS_PRICE",
  "NETWORK_ERROR",
  "REPLACEMENT_UNDERPRICED",
  "UNKNOWN_RPC_ERROR",
] as const;

export type AdminDispatchStatus = (typeof ADMIN_DISPATCH_STATUSES)[number];

/** The envelope both chain-backed transaction rows carry. */
type AdminChainTransaction = {
  /**
   * The cursor. clc-core packs the transaction id and the log index into one
   * number, because the underlying event tables each have their own id sequence
   * and none of them can order a merged page. Treat it as opaque.
   */
  id: number;
  txId: number;
  logIndex: number;
  txHash: string;
  /** Block timestamp, ISO 8601. */
  t: string;
  /** Whether the transaction was mined without reverting. */
  success: boolean;
};

export type AdminVoucherTransaction = AdminChainTransaction & {
  type: AdminVoucherTxType;
  voucher: string;
  voucherName: string;
  voucherSymbol: string;
  /**
   * Null when the local catalog does not know this voucher, in which case the
   * amount cannot be scaled and has to be presented as the raw integer it is.
   */
  voucherDecimals: number | null;
  from: string;
  /** Null for a burn: the supply is destroyed rather than delivered. */
  to: string | null;
  /** Raw on-chain integer. Null only if the backend sent something unscalable. */
  amount: string | null;
};

export type AdminPoolTransaction = AdminChainTransaction & {
  type: AdminPoolTxType;
  pool: string;
  /** The account that sent the transaction, not the pool. */
  initiator: string;
  tokenIn: string;
  tokenInSymbol: string;
  tokenInDecimals: number | null;
  amountIn: string | null;
  /** The out side is null for a deposit, which is one-sided. */
  tokenOut: string | null;
  tokenOutSymbol: string;
  tokenOutDecimals: number | null;
  amountOut: string | null;
  /** Denominated in `tokenOut`, and excluding the protocol fee. */
  fee: string | null;
  /** Output-token units. Omitted by older backends; null for legacy swaps. */
  protocolFee?: string | null;
};

export type AdminOTX = {
  id: number;
  trackingId: string;
  otxType: string;
  /** The clc-core keystore account that signed it. */
  signer: string;
  txHash: string;
  nonce: number;
  /** True once a replacement was sent for the same nonce. */
  replaced: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type AdminVoucherTransactionPage = {
  transactions: Array<AdminVoucherTransaction>;
  first: number;
  last: number;
  receivedCount: number;
};

type AdminPoolTransactionPage = {
  transactions: Array<AdminPoolTransaction>;
  first: number;
  last: number;
  receivedCount: number;
};

type AdminOTXPage = {
  otx: Array<AdminOTX>;
  first: number;
  last: number;
  receivedCount: number;
};

export type AdminVoucherTransactionParams = CursorParams & {
  type?: AdminVoucherTxType;
  /** A whole voucher address. The backend matches nothing partial. */
  voucher?: string;
  /** Matched by the backend against sender, recipient, hash and voucher. */
  q?: string;
};

export type AdminPoolTransactionParams = CursorParams & {
  type?: AdminPoolTxType;
  /** A whole pool address. */
  pool?: string;
  /** Matched by the backend against hash, initiator, pool and either voucher. */
  q?: string;
};

export type AdminOTXParams = CursorParams & {
  type?: AdminOTXType;
  status?: AdminDispatchStatus;
  /** Matched by the backend against tracking ID and transaction hash. */
  q?: string;
};

/**
 * One row of the console's voucher catalog.
 *
 * Not `MarketVoucher`. That type's coordinates are non-nullable because every
 * public statement filters incomplete rows, and this endpoint filters neither
 * coordinates nor visibility — an ungeolocated or retired voucher is exactly
 * what an operator comes here to find.
 */
export type AdminVoucher = {
  id: string;
  chainId: number;
  address: HexAddress;
  name: string;
  symbol: string;
  iconUrl: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  kind: MarketVoucherKind;
  /** False once the voucher has been retired out of the public catalog. */
  active: boolean;
};

type AdminVoucherPage = {
  vouchers: AdminVoucher[];
  first: number;
  last: number;
  receivedCount: number;
};

/** Which side of the visibility gate to list. `all` is the backend default. */
type AdminVoucherStatus = "all" | "active" | "retired";

type AdminReviewAction = "hide" | "dismiss";

export type AdminReviewFlag = {
  id: number;
  reviewId: number;
  voucherAddress: string;
  reason: string;
  stars: number;
  comment: string;
  reportedStars: number;
  reportedComment: string;
  createdAt: string;
};

export type AdminReviewParams = {
  /** Flags with an id below this one. Absent on the first page. */
  before?: number;
};

type AdminReviewPage = {
  notifications: Array<AdminReviewFlag>;
  next: number | null;
};

export type AdminDeployment = {
  id: number;
  userId: number;
  trackingId: string;
  resourceType: string;
  createdAt: string;
  ethereumAddress: string;
  userName: string;
};

export type AdminDeploymentParams = {
  perPage: number;
  cursor?: number;
  next?: boolean;
};

type AdminDeploymentPage = {
  deployments: Array<AdminDeployment>;
  first: number;
  last: number;
  receivedCount: number;
};

type AdminTokenUpgradeResult = {
  trackingId: string;
  address: string;
};

type AdminPoolUpgradeResult = {
  /** Absent when every contract is already current, or no implementation is available. */
  trackingId?: string;
  upgrades: Array<{ type: string; address: string }>;
  skipped: Array<{ type: string; address: string; reason: string }>;
};

export type AdminVoucherParams = CursorParams & {
  filter: CatalogFilter;
  status?: AdminVoucherStatus;
  /** Only vouchers owned by this address. Compared case-insensitively. */
  owner?: string;
};

export type AdminPoolParams = CursorParams & {
  filter: CatalogFilter;
  status?: "all" | "active" | "retired";
  owner?: string;
};

export type AdminClient = {
  listPools(params: AdminPoolParams, signal?: AbortSignal): Promise<UserPoolPage>;
  getPoolByAddress(address: string, signal?: AbortSignal): Promise<UserPool>;
  /** One cursor page of the account directory, newest first. */
  listUsers(params: AdminUserParams, signal?: AbortSignal): Promise<AdminUserPage>;
  approveUser(address: string): Promise<AdminUser>;
  rejectUser(address: string): Promise<AdminUser>;
  updateUserLimits(address: string, limits: AdminUserLimits): Promise<AdminUser>;
  updateUserProfile(address: string, profile: AdminUserProfile): Promise<AdminUser>;
  getAccountStats(address: string, signal?: AbortSignal): Promise<AdminAccountStats>;
  getAccountPools(
    address: string,
    params: CursorParams,
    signal?: AbortSignal,
  ): Promise<UserPoolPage>;
  updatePoolProfile(
    address: string,
    profile: PoolProfileUpdate,
    signal?: AbortSignal,
  ): Promise<UserPool>;
  updateVoucherProfile(
    address: string,
    profile: VoucherProfileUpdate,
    signal?: AbortSignal,
  ): Promise<MarketVoucherDetail>;
  /** One cursor page of the catalog, retired vouchers included. */
  listVouchers(params: AdminVoucherParams, signal?: AbortSignal): Promise<AdminVoucherPage>;
  /** One voucher whatever its visibility. */
  getVoucher(address: string, signal?: AbortSignal): Promise<MarketVoucherDetail>;
  /** Returns a retired voucher to the public catalog. */
  restoreVoucher(address: string, signal?: AbortSignal): Promise<MarketVoucherDetail>;
  getStats(params: AdminStatsParams, signal?: AbortSignal): Promise<AdminStats>;
  /** Transfers, mints and burns, newest first. */
  listVoucherTransactions(
    params: AdminVoucherTransactionParams,
    signal?: AbortSignal,
  ): Promise<AdminVoucherTransactionPage>;
  /** Swaps and deposits, newest first. */
  listPoolTransactions(
    params: AdminPoolTransactionParams,
    signal?: AbortSignal,
  ): Promise<AdminPoolTransactionPage>;
  /** Origin transactions this service signed, newest first. */
  listOTX(params: AdminOTXParams, signal?: AbortSignal): Promise<AdminOTXPage>;
  /** One page of unresolved review flags, older than `before` when set. */
  listReviewNotifications(
    params: AdminReviewParams,
    signal?: AbortSignal,
  ): Promise<AdminReviewPage>;
  resolveReviewFlag(id: number, action: AdminReviewAction): Promise<void>;
  /**
   * Deployment history. Prefers the server cursor. Falls back to paging the
   * full list when the server has not grown a cursor yet.
   */
  listDeployments(
    params: AdminDeploymentParams,
    signal?: AbortSignal,
  ): Promise<AdminDeploymentPage>;
  /** Queues a proxy upgrade. The session must be a superadmin or a service token. */
  upgradeToken(address: string): Promise<AdminTokenUpgradeResult>;
  upgradePool(address: string): Promise<AdminPoolUpgradeResult>;
};

/**
 * Fills in the location keys the response omits, and drops a half-pair.
 *
 * A latitude without a longitude cannot be shown on a map or in a coordinate
 * pair, so it is reported as no location rather than as a partial one — the same
 * both-or-neither rule the database enforces on write.
 */
function normalizeAdminUser(user: BackendAdminUser): AdminUser {
  const geoLat = normalizeNumber(user.geoLat);
  const geoLng = normalizeNumber(user.geoLng);
  const located = geoLat !== null && geoLng !== null;

  return {
    ...user,
    preferredCurrency: normalizeText(user.preferredCurrency),
    bio: normalizeText(user.bio),
    website: normalizeText(user.website),
    // Absent on a backend that predates avatars, and "" from one that has the
    // column but nothing in it; both mean no image.
    avatarUrl: normalizeText(user.avatarUrl),
    locationName: normalizeText(user.locationName),
    geoLat: located ? geoLat : null,
    geoLng: located ? geoLng : null,
  };
}

/**
 * The two chain pages differ only in which contract they filter on, so the
 * cursor query is built once. An empty filter is left off rather than sent
 * blank: clc-core rejects an address it cannot parse, and a blank one is a
 * request there is nothing to decide about.
 */
function adminTxQuery(
  params: CursorParams & { type?: string; q?: string },
  contractKey: string,
  contract: string | undefined,
): string {
  const query = new URLSearchParams(formatCursorQuery(params).replace(/^\?/, ""));
  if (params.type) query.set("type", params.type);
  if (contract) query.set(contractKey, contract);
  if (params.q) query.set("q", params.q);
  return `?${query.toString()}`;
}

/** Decimals the local catalog could not supply arrive as null and stay null. */
function normalizeDecimals(value: unknown): number | null {
  const decimals = normalizeNumber(value);
  return decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 255
    ? decimals
    : null;
}

/**
 * The nullable fields are the ones normalization decides, so the wire shapes
 * leave them loose and the exported types state the outcome.
 */
type BackendAdminVoucherTransaction = Omit<
  AdminVoucherTransaction,
  "voucherDecimals" | "to" | "amount"
> & { voucherDecimals: unknown; to: unknown; amount: unknown };

type BackendAdminPoolTransaction = Omit<
  AdminPoolTransaction,
  | "tokenInDecimals"
  | "tokenOut"
  | "tokenOutDecimals"
  | "amountIn"
  | "amountOut"
  | "fee"
  | "protocolFee"
> & {
  tokenInDecimals: unknown;
  tokenOut: unknown;
  tokenOutDecimals: unknown;
  amountIn: unknown;
  amountOut: unknown;
  fee: unknown;
  protocolFee?: unknown;
};

type BackendAdminPool = Parameters<typeof normalizeUserPool>[0];

type BackendAdminPoolPage = {
  pools?: Array<BackendAdminPool> | null;
  first?: number;
  last?: number;
};

type BackendAdminPoolEnvelope = { pool?: BackendAdminPool | null } & BackendAdminPool;

type BackendAdminVoucherEnvelope = {
  voucher?: BackendMarketVoucherDetail | null;
} & BackendMarketVoucherDetail;

type BackendAdminVoucherRow = Partial<{
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
  active: boolean | null;
}>;

type BackendAdminVoucherPage = {
  vouchers?: Array<BackendAdminVoucherRow> | null;
  first?: number;
  last?: number;
};

const ADMIN_VOUCHER_KINDS = new Set<MarketVoucherKind>(["goods", "services", "voucher"]);

function formatAdminVoucherQuery({ filter, status, owner, ...cursor }: AdminVoucherParams): string {
  const search = new URLSearchParams(formatCursorQuery(cursor));
  if (filter.term !== "") search.set("q", filter.term);
  if (filter.tags.length > 0) search.set("tags", filter.tags.join(","));
  if (filter.tags.length > 1 && filter.tagMatch === "all") search.set("tagMatch", "all");
  if (owner) search.set("owner", owner);
  // Omitted rather than sent as "all": the backend already defaults to the whole
  // catalog, and a redundant parameter is one more thing two sides must agree on.
  if (status && status !== "all") search.set("status", status);
  return `?${search.toString()}`;
}

/**
 * A console row is dropped only when it has no usable identity. Missing
 * coordinates are kept, unlike the public list where they are a reason to drop
 * the row: an ungeolocated voucher is invisible to the market and so is one of
 * the rows an operator most needs to see.
 */
function normalizeAdminVoucher(voucher: BackendAdminVoucherRow): AdminVoucher | null {
  const address = normalizeHex(voucher.address);
  const chainId = normalizeChainId(voucher.chainId);
  if (!address || chainId === null || voucher.id === undefined || voucher.id === null) return null;

  const lat = normalizeCoordinate(voucher.geoLat, 90);
  const lng = normalizeCoordinate(voucher.geoLng, 180);
  const hasLocation = lat !== null && lng !== null;
  const kind = voucher.kind;

  return {
    id: String(voucher.id),
    chainId,
    address,
    name: normalizeText(voucher.name) ?? "Community Voucher",
    symbol: normalizeText(voucher.symbol) ?? "VOUCHER",
    iconUrl: normalizeText(voucher.iconUrl),
    locationName: normalizeText(voucher.locationName),
    lat: hasLocation ? lat : null,
    lng: hasLocation ? lng : null,
    kind:
      typeof kind === "string" && ADMIN_VOUCHER_KINDS.has(kind as MarketVoucherKind)
        ? (kind as MarketVoucherKind)
        : "voucher",
    active: voucher.active !== false,
  };
}

export function createAdminClient(http: HttpClient): AdminClient {
  /**
   * Mutations answer with the updated row, which callers write straight into the
   * cache rather than re-listing an unpaginated endpoint.
   */
  async function mutateUser(
    path: string,
    body?: AdminUserLimits | AdminUserProfile,
  ): Promise<AdminUser> {
    const result = await http.request<{ user: BackendAdminUser }>(path, {
      method: "PUT",
      // A PUT with no body must send none: the transport only sets the JSON
      // content type when a body is present.
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return normalizeAdminUser(result.user);
  }

  return {
    async listUsers(params, signal) {
      const query = new URLSearchParams(formatCursorQuery(params).replace(/^\?/, ""));
      // Only sent when there is a term: an empty `q` is a request the backend
      // would have to decide about, and there is nothing to decide.
      if (params.q) query.set("q", params.q);
      if (params.status) query.set("status", params.status);

      const result = await http.request<{
        users?: Array<BackendAdminUser> | null;
        first?: number;
        last?: number;
      }>(`/api/v2/admin/users?${query.toString()}`, { method: "GET", signal });

      // The handler answers `{"users": null}` for an empty page rather than an
      // empty array, which would otherwise reach the UI as a crash rather than
      // as "no rows".
      const received = (result.users ?? []).map(normalizeAdminUser);
      return {
        users: received,
        first: result.first ?? 0,
        last: result.last ?? 0,
        receivedCount: received.length,
      };
    },

    // The address goes into the path, so it must be encoded even though a valid
    // hex address needs no escaping — a malformed one must not alter the route.
    approveUser(address) {
      return mutateUser(`/api/v2/admin/users/${encodeURIComponent(address)}/approve`);
    },

    rejectUser(address) {
      return mutateUser(`/api/v2/admin/users/${encodeURIComponent(address)}/reject`);
    },

    updateUserLimits(address, limits) {
      return mutateUser(`/api/v2/admin/users/${encodeURIComponent(address)}/limits`, limits);
    },

    updateUserProfile(address, profile) {
      return mutateUser(`/api/v2/admin/users/${encodeURIComponent(address)}/profile`, profile);
    },

    async getAccountStats(address, signal) {
      const result = await http.request<Partial<AdminAccountStats>>(
        `/api/v2/admin/users/${encodeURIComponent(address)}/stats`,
        { method: "GET", signal },
      );
      return {
        reports: result.reports ?? 0,
        vouchers: result.vouchers ?? 0,
        poolMemberships: result.poolMemberships ?? 0,
        transactions: result.transactions ?? null,
        swaps: result.swaps ?? null,
        partners: result.partners ?? null,
      };
    },

    async getAccountPools(address, params, signal) {
      const result = await http.request<BackendAdminPoolPage>(
        `/api/v2/admin/users/${encodeURIComponent(address)}/pools${formatCursorQuery(params)}`,
        { method: "GET", cache: "no-store", signal },
      );
      const received = result.pools ?? [];
      return {
        ...result,
        pools: received.map(normalizeUserPool).filter(isPresent),
        receivedCount: received.length,
      };
    },

    async listPools(params, signal) {
      const search = new URLSearchParams(formatCursorQuery(params));
      if (params.filter.term) search.set("q", params.filter.term);
      if (params.filter.tags.length) search.set("tags", params.filter.tags.join(","));
      if (params.filter.tagMatch === "all") search.set("tagMatch", "all");
      if (params.status) search.set("status", params.status);
      if (params.owner) search.set("owner", params.owner);
      const result = await http.request<BackendAdminPoolPage>(
        `/api/v2/admin/pool-catalog?${search.toString()}`,
        { method: "GET", cache: "no-store", signal },
      );
      const received = result.pools ?? [];
      return {
        ...result,
        pools: received.map(normalizeUserPool).filter(isPresent),
        receivedCount: received.length,
      };
    },

    async getPoolByAddress(address, signal) {
      const result = await http.request<BackendAdminPoolEnvelope>(
        `/api/v2/admin/pools/${encodeURIComponent(address)}`,
        { method: "GET", cache: "no-store", signal },
      );
      const pool = normalizeUserPool(result.pool ?? result);
      if (!pool) throw new Error("Pool response did not include a valid address.");
      return pool;
    },

    /** Saves an operator's edits to a pool's off-chain catalog record. */
    async updatePoolProfile(address, profile, signal) {
      const result = await http.request<BackendAdminPoolEnvelope>(
        `/api/v2/admin/pools/${encodeURIComponent(address)}/profile`,
        { method: "PUT", signal, body: JSON.stringify(serializePoolProfileUpdate(profile)) },
      );
      const pool = normalizeUserPool(result.pool ?? result);
      if (!pool) throw new Error("Pool update response did not include a valid address.");
      return pool;
    },

    /**
     * Saves an operator's edits to a voucher's off-chain catalog record.
     *
     * The response is the public detail row, not an admin-only shape, because it
     * is what the console already caches for this voucher — so the saved record
     * can be written straight into that cache rather than refetched through a
     * second endpoint that would have to agree with this one.
     */
    async updateVoucherProfile(address, profile, signal) {
      const result = await http.request<BackendAdminVoucherEnvelope>(
        `/api/v2/admin/vouchers/${encodeURIComponent(address)}/profile`,
        { method: "PUT", signal, body: JSON.stringify(serializeVoucherProfileUpdate(profile)) },
      );
      const voucher = normalizeMarketVoucherDetail(result.voucher ?? result);
      if (!voucher) throw new Error("Voucher update response did not include a valid address.");
      return voucher;
    },

    /**
     * The catalog as an operator sees it: no visibility gate, no coordinate
     * requirement, and no viewport. The public list has all three, which is why
     * the console cannot reach a retired voucher through it.
     */
    async listVouchers(params, signal) {
      const result = await http.request<BackendAdminVoucherPage>(
        `/api/v2/admin/vouchers${formatAdminVoucherQuery(params)}`,
        { method: "GET", signal },
      );

      const received = result.vouchers ?? [];
      return {
        vouchers: received.map(normalizeAdminVoucher).filter(isPresent),
        first: normalizeNumber(result.first) ?? 0,
        last: normalizeNumber(result.last) ?? 0,
        receivedCount: received.length,
      };
    },

    /**
     * One voucher whatever its visibility, so the detail screen survives a
     * retire and can offer the restore.
     */
    async getVoucher(address, signal) {
      const result = await http.request<BackendAdminVoucherEnvelope>(
        `/api/v2/admin/vouchers/${encodeURIComponent(address)}`,
        { method: "GET", signal },
      );
      const voucher = normalizeMarketVoucherDetail(result.voucher ?? result);
      if (!voucher) throw new Error("Voucher response did not include a valid address.");
      return voucher;
    },

    /** Superadmin-only: there is no owner-facing restore. */
    async restoreVoucher(address, signal) {
      const result = await http.request<BackendAdminVoucherEnvelope>(
        `/api/v2/admin/vouchers/${encodeURIComponent(address)}/restore`,
        { method: "PUT", signal },
      );
      const voucher = normalizeMarketVoucherDetail(result.voucher ?? result);
      if (!voucher) throw new Error("Voucher restore response did not include a valid address.");
      return voucher;
    },

    async getStats(params, signal) {
      const query = new URLSearchParams({ range: params.range });
      if (params.since) query.set("since", params.since);
      if (params.until) query.set("until", params.until);
      const result = await http.request<AdminStats>(
        `/api/v2/admin/dashboard/stats?${query.toString()}`,
        { method: "GET", signal },
      );
      return {
        range: result.range,
        pools: result.pools,
        vouchers: result.vouchers,
        reports: result.reports,
        accounts: result.accounts,
        transactions: result.transactions ?? null,
        catalogSeries: result.catalogSeries ?? [],
        transactionSeries: result.transactionSeries ?? [],
      };
    },

    async listVoucherTransactions(params, signal) {
      const result = await http.request<{
        transactions?: Array<BackendAdminVoucherTransaction> | null;
        first?: number;
        last?: number;
      }>(`/api/v2/admin/transactions/vouchers${adminTxQuery(params, "voucher", params.voucher)}`, {
        method: "GET",
        signal,
      });

      const received = (result.transactions ?? []).map((row) => ({
        ...row,
        voucherDecimals: normalizeDecimals(row.voucherDecimals),
        to: normalizeText(row.to),
        amount: normalizeRawAmount(row.amount),
      }));
      return {
        transactions: received,
        first: result.first ?? 0,
        last: result.last ?? 0,
        receivedCount: received.length,
      };
    },

    async listPoolTransactions(params, signal) {
      const result = await http.request<{
        transactions?: Array<BackendAdminPoolTransaction> | null;
        first?: number;
        last?: number;
      }>(`/api/v2/admin/transactions/pools${adminTxQuery(params, "pool", params.pool)}`, {
        method: "GET",
        signal,
      });

      const received = (result.transactions ?? []).map((row) => ({
        ...row,
        tokenInDecimals: normalizeDecimals(row.tokenInDecimals),
        tokenOut: normalizeText(row.tokenOut),
        tokenOutDecimals: normalizeDecimals(row.tokenOutDecimals),
        amountIn: normalizeRawAmount(row.amountIn),
        amountOut: normalizeRawAmount(row.amountOut),
        fee: normalizeRawAmount(row.fee),
        protocolFee: normalizeRawAmount(row.protocolFee),
      }));
      return {
        transactions: received,
        first: result.first ?? 0,
        last: result.last ?? 0,
        receivedCount: received.length,
      };
    },

    async listOTX(params, signal) {
      const query = new URLSearchParams(formatCursorQuery(params).replace(/^\?/, ""));
      if (params.type) query.set("type", params.type);
      if (params.status) query.set("status", params.status);
      if (params.q) query.set("q", params.q);

      const result = await http.request<{
        otx?: Array<AdminOTX> | null;
        first?: number;
        last?: number;
      }>(`/api/v2/admin/transactions/otx?${query.toString()}`, { method: "GET", signal });

      // Answered as `{"otx": null}` for an empty page rather than as an empty
      // array, the same shape /admin/users uses.
      const received = result.otx ?? [];
      return {
        otx: received,
        first: result.first ?? 0,
        last: result.last ?? 0,
        receivedCount: received.length,
      };
    },

    async listReviewNotifications(params, signal) {
      const query = new URLSearchParams();
      if (params.before) query.set("before", String(params.before));
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const result = await http.request<{
        notifications?: Array<AdminReviewFlag> | null;
        next?: number | null;
      }>(`/api/v2/admin/review-notifications${suffix}`, { method: "GET", signal });
      return {
        notifications: result.notifications ?? [],
        next: typeof result.next === "number" ? result.next : null,
      };
    },

    async resolveReviewFlag(id, action) {
      await http.request(`/api/v2/admin/review-notifications/${id}`, {
        method: "PUT",
        body: JSON.stringify({ action }),
      });
    },

    async listDeployments(params, signal) {
      const query = new URLSearchParams(formatCursorQuery(params).replace(/^\?/, ""));
      const result = await http.request<{
        deployments?: Array<AdminDeployment> | null;
        first?: number;
        last?: number;
      }>(`/api/v2/admin/deployments?${query.toString()}`, { method: "GET", signal });
      const rows = result.deployments ?? [];
      if (typeof result.first === "number" && typeof result.last === "number") {
        return {
          deployments: rows,
          first: result.first,
          last: result.last,
          receivedCount: rows.length,
        };
      }
      return pageDeployments(rows, params);
    },

    upgradeToken(address) {
      return requestUpgrade<AdminTokenUpgradeResult>(
        http,
        "/api/v2/contracts/upgrade/token",
        address,
      );
    },

    upgradePool(address) {
      return requestUpgrade<AdminPoolUpgradeResult>(
        http,
        "/api/v2/contracts/upgrade/pool",
        address,
      );
    },
  };
}

function requestUpgrade<TResult>(
  http: HttpClient,
  path: string,
  address: string,
): Promise<TResult> {
  return http.request<TResult>(path, {
    method: "POST",
    body: JSON.stringify({ address: getAddress(address) }),
  });
}

/**
 * Pages a newest-first dump by id when the server ignored the cursor.
 *
 * `next: false` is the window immediately newer than the cursor, still shown
 * newest first. Taking the head of `id > cursor` would skip to the newest rows
 * in the table instead.
 */
function pageDeployments(
  rows: Array<AdminDeployment>,
  params: AdminDeploymentParams,
): AdminDeploymentPage {
  const ordered = [...rows].sort((left, right) => right.id - left.id);
  let window = ordered;
  if (params.cursor && params.next === false) {
    window = ordered
      .filter((row) => row.id > (params.cursor as number))
      .sort((left, right) => left.id - right.id)
      .slice(0, params.perPage)
      .sort((left, right) => right.id - left.id);
  } else if (params.cursor) {
    window = ordered.filter((row) => row.id < (params.cursor as number)).slice(0, params.perPage);
  } else {
    window = ordered.slice(0, params.perPage);
  }
  return {
    deployments: window,
    first: window[0]?.id ?? 0,
    last: window.at(-1)?.id ?? 0,
    receivedCount: window.length,
  };
}
