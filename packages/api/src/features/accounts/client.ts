import type { HttpClient } from "../../client/http-client";
import { getAddress } from "viem";

export type AccountToken = {
  id: number;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimals: number;
  balance: string;
  iconUrl: string | null;
  lastDateBlock: string;
};

export type AccountTokensResult = {
  tokens: AccountToken[];
  first?: number;
  last?: number;
};

type AccountTransferDirection = "IN" | "OUT";

type AccountTransfer = {
  id: number;
  txHash: string;
  dateBlock: string;
  direction: AccountTransferDirection;
  counterpartyAddress: string;
  senderAddress: string;
  recipientAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
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
      return { ...result, tokens: result.tokens ?? [] };
    },

    async getAccountTokens(params: CursorPageParams): Promise<AccountTokensResult> {
      const accountAddress = getAddress(params.address);
      const result = await http.request<AccountTokensResult>(
        `/api/v2/accounts/${accountAddress}/tokens${formatCursorQuery(params)}`,
        ACCOUNT_READ_REQUEST,
      );
      return { ...result, tokens: result.tokens ?? [] };
    },

    async getAccountTransfers(params: CursorPageParams): Promise<AccountTransfersResult> {
      const accountAddress = getAddress(params.address);
      const result = await http.request<AccountTransfersResult>(
        `/api/v2/accounts/${accountAddress}/transfers${formatCursorQuery(params)}`,
        ACCOUNT_READ_REQUEST,
      );
      return { ...result, transfers: result.transfers ?? [] };
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

function formatCursorQuery(params: CursorPageParams): string {
  const search = new URLSearchParams({ perPage: params.perPage.toString() });
  if (params.cursor !== undefined) search.set("cursor", params.cursor.toString());
  if (params.next !== undefined) search.set("next", params.next ? "true" : "false");
  return `?${search.toString()}`;
}
