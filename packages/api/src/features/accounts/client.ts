import type { HttpClient } from "../../client/http-client";
import { getAddress } from "viem";
import { normalizeVoucherSymbol } from "../../lib/api-normalize";

type TokenLabel = {
  tokenSymbol: string;
  /** Undefined means this response has no editable catalog label (including older APIs). */
  displaySymbol?: string | null;
  /** Original wire ticker, retained for accounting exports. */
  contractSymbol?: string;
};

export type AccountToken = TokenLabel & {
  /** Absent for tokens outside the local catalog; false means retired. */
  catalogActive?: boolean;
  id: number;
  tokenAddress: string;
  tokenName: string;
  tokenDecimals: number;
  balance: string;
  iconUrl: string | null;
  lastDateBlock: string;
  /**
   * The issuer's stated rate from the catalog: one token is worth
   * `voucherValue` `voucherUoa`. Absent when the catalog has none.
   */
  voucherValue?: string | null;
  voucherUoa?: string | null;
};

export type AccountTokensResult = {
  tokens: AccountToken[];
  first?: number;
  last?: number;
};

/** A voucher the signed-in account owns, retired ones included. */
export type OwnedVoucher = {
  id: number;
  address: string;
  name: string;
  symbol: string;
  displaySymbol?: string | null;
  ownerAddress: string;
  active: boolean;
};

export type OwnedVouchersResult = {
  vouchers: OwnedVoucher[];
  first?: number;
  last?: number;
};

type AccountTransferDirection = "IN" | "OUT";

type AccountTransfer = TokenLabel & {
  id: number;
  txHash: string;
  dateBlock: string;
  direction: AccountTransferDirection;
  counterpartyAddress: string;
  senderAddress: string;
  recipientAddress: string;
  tokenAddress: string;
  tokenName: string;
  tokenDecimals: number;
  amount: string;
  success: boolean;
  /** Immutable informational valuation captured when the transfer was submitted. */
  uoaValue?: string;
  uoa?: string;
  /**
   * Whether this transfer carries a private attachment (a message and/or
   * shared contact details) the caller is allowed to read. The backend joins
   * it in from clc-core's own database; the transfer rows themselves come from
   * the federation indexer, which knows nothing about attachments.
   */
  hasNote: boolean;
};

export type ActivityKind =
  | "creation"
  | "sent"
  | "received"
  | "swapped"
  | "deposited"
  | "pool_payout";

export type ActivityLeg = TokenLabel & {
  tokenAddress: string;
  tokenName: string;
  tokenDecimals: number;
  amount: string;
  /** Immutable informational valuation captured when the transfer was submitted. */
  uoaValue?: string;
  uoa?: string;
};

type DirectAccountActivityItem = {
  kind: Exclude<ActivityKind, "swapped">;
  direction?: "IN" | "OUT";
  poolAddresses?: string[];
  poolName?: string;
  id: number;
  txHash: string;
  dateBlock: string;
  success: boolean;
  transfer: ActivityLeg;
  senderAddress: string;
  recipientAddress: string;
  counterpartyAddress: string;
  hasNote: boolean;
};

type SwapAccountActivityItem = {
  kind: "swapped";
  counterpartyAddress?: string;
  senderAddress?: string;
  recipientAddress?: string;
  initiatorAddress?: string;
  poolName?: string;
  id: number;
  txHash: string;
  dateBlock: string;
  success: boolean;
  sent: ActivityLeg;
  received: ActivityLeg;
  protocolFee?: ActivityLeg;
  poolAddresses: string[];
};

export type AccountActivityItem = DirectAccountActivityItem | SwapAccountActivityItem;

export type AccountActivityResult = {
  activity: AccountActivityItem[];
  first?: number;
  last?: number;
};

export type AccountTransfersResult = {
  transfers: AccountTransfer[];
  first?: number;
  last?: number;
};

export type CursorPageParams = {
  address: string;
  perPage: number;
  cursor?: number;
  next?: boolean;
};

/** On-chain and keystore state from `GET /api/v2/account/status/:address`. */
export type AccountStatus = {
  gasBalance: string;
  networkNonce: number;
  internalNonce: number;
  active: boolean;
};

const ACCOUNT_READ_REQUEST: RequestInit = {
  method: "GET",
  cache: "no-store",
};

export type AccountsClient = ReturnType<typeof createAccountsClient>;

export function createAccountsClient(http: HttpClient) {
  return {
    // The backend returns `tokens: null` / `transfers: null` for accounts with no
    // history rather than an empty array, so normalize to `[]` at the boundary to
    // keep the typed contract honest and every consumer's `.map` / `.length` safe.
    async getLatestAccountTokens(address: string): Promise<AccountTokensResult> {
      const accountAddress = getAddress(address);
      const result = await http.request<AccountTokensResult>(
        `/api/v2/accounts/${accountAddress}/tokens/latest`,
        ACCOUNT_READ_REQUEST,
      );
      return { ...result, tokens: (result.tokens ?? []).map(withVoucherLabel) };
    },

    async getAccountTokens(
      params: CursorPageParams,
      signal?: AbortSignal,
    ): Promise<AccountTokensResult> {
      const accountAddress = getAddress(params.address);
      const result = await http.request<AccountTokensResult>(
        `/api/v2/accounts/${accountAddress}/tokens${formatCursorQuery(params)}`,
        { ...ACCOUNT_READ_REQUEST, signal },
      );
      return { ...result, tokens: (result.tokens ?? []).map(withVoucherLabel) };
    },

    /**
     * The catalog vouchers an account owns, with its balance of each. Same rows
     * and cursors as `getAccountTokens`, but a zero balance is kept: a voucher
     * whose opening supply was never created is still the owner's.
     */
    async getAccountIssuedTokens(
      params: CursorPageParams,
      signal?: AbortSignal,
    ): Promise<AccountTokensResult> {
      const accountAddress = getAddress(params.address);
      const result = await http.request<AccountTokensResult>(
        `/api/v2/accounts/${accountAddress}/tokens/issued${formatCursorQuery(params)}`,
        { ...ACCOUNT_READ_REQUEST, signal },
      );
      return { ...result, tokens: (result.tokens ?? []).map(withVoucherLabel) };
    },

    /**
     * `GET /api/v2/users/me/vouchers`: what the signed-in account owns,
     * retired vouchers included. `owner` may name one of the account's replaced
     * sign-in cards, to find the vouchers its old wallet still owns on chain.
     */
    async getOwnedVouchers(
      params: Omit<CursorPageParams, "address"> & { owner?: string },
    ): Promise<OwnedVouchersResult> {
      const search = formatCursorSearch({ ...params, address: "" });
      if (params.owner) search.set("owner", getAddress(params.owner));
      const result = await http.request<OwnedVouchersResult>(
        `/api/v2/users/me/vouchers?${search.toString()}`,
        ACCOUNT_READ_REQUEST,
      );
      return {
        ...result,
        vouchers: (result.vouchers ?? []).map((voucher) => ({
          ...voucher,
          symbol: normalizeVoucherSymbol(
            voucher.displaySymbol,
            voucher.symbol,
            voucher.address,
            voucher.name,
          ),
        })),
      };
    },

    async getAccountTransfers(
      params: CursorPageParams & { q?: string },
      signal?: AbortSignal,
    ): Promise<AccountTransfersResult> {
      const accountAddress = getAddress(params.address);
      const result = await http.request<AccountTransfersResult>(
        `/api/v2/accounts/${accountAddress}/transfers${formatCursorQuery(params)}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}`,
        { ...ACCOUNT_READ_REQUEST, signal },
      );
      return { ...result, transfers: (result.transfers ?? []).map(withVoucherLabel) };
    },

    async getAccountActivity(
      params: CursorPageParams & { q?: string; types?: readonly ActivityKind[] },
      signal?: AbortSignal,
    ): Promise<AccountActivityResult> {
      const accountAddress = getAddress(params.address);
      const search = formatCursorSearch(params);
      if (params.q) search.set("q", params.q);
      if (params.types?.length) search.set("types", params.types.join(","));
      const result = await http.request<AccountActivityResult>(
        `/api/v2/accounts/${accountAddress}/activity?${search.toString()}`,
        { ...ACCOUNT_READ_REQUEST, signal },
      );
      return { ...result, activity: (result.activity ?? []).map(withActivityLabels) };
    },

    /**
     * Native gas, nonces, and keystore active flag for a signer the backend
     * already holds. The address is a path parameter, so it is encoded even
     * though a valid hex address needs no escaping.
     */
    async getAccountStatus(address: string, signal?: AbortSignal): Promise<AccountStatus> {
      const accountAddress = getAddress(address);
      return http.request<AccountStatus>(
        `/api/v2/account/status/${encodeURIComponent(accountAddress)}`,
        {
          ...ACCOUNT_READ_REQUEST,
          signal,
        },
      );
    },
  };
}

function withVoucherLabel<T extends TokenLabel & { tokenAddress: string; tokenName: string }>(
  token: T,
): T {
  if (token.displaySymbol === undefined) return token;
  return {
    ...token,
    contractSymbol: token.tokenSymbol,
    tokenSymbol: normalizeVoucherSymbol(
      token.displaySymbol,
      token.tokenSymbol,
      token.tokenAddress,
      token.tokenName,
    ),
  };
}

function withActivityLabels(item: AccountActivityItem): AccountActivityItem {
  if (item.kind !== "swapped") return { ...item, transfer: withVoucherLabel(item.transfer) };
  return {
    ...item,
    sent: withVoucherLabel(item.sent),
    received: withVoucherLabel(item.received),
    ...(item.protocolFee ? { protocolFee: withVoucherLabel(item.protocolFee) } : {}),
  };
}

function formatCursorQuery(params: CursorPageParams): string {
  return `?${formatCursorSearch(params).toString()}`;
}

function formatCursorSearch(params: CursorPageParams): URLSearchParams {
  const search = new URLSearchParams({ perPage: params.perPage.toString() });
  if (params.cursor !== undefined) search.set("cursor", params.cursor.toString());
  if (params.next !== undefined) search.set("next", params.next ? "true" : "false");
  return search;
}
