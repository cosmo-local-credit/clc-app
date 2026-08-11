import type { HttpClient } from "../../client/http-client";

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
      const result = await http.request<AccountTokensResult>(
        `/api/v2/accounts/${address}/tokens/latest`,
        ACCOUNT_READ_REQUEST,
      );
      return { ...result, tokens: result.tokens ?? [] };
    },

    async getAccountTokens(params: CursorPageParams): Promise<AccountTokensResult> {
      const result = await http.request<AccountTokensResult>(
        `/api/v2/accounts/${params.address}/tokens${formatCursorQuery(params)}`,
        ACCOUNT_READ_REQUEST,
      );
      return { ...result, tokens: result.tokens ?? [] };
    },

    async getAccountTransfers(params: CursorPageParams): Promise<AccountTransfersResult> {
      const result = await http.request<AccountTransfersResult>(
        `/api/v2/accounts/${params.address}/transfers${formatCursorQuery(params)}`,
        ACCOUNT_READ_REQUEST,
      );
      return { ...result, transfers: result.transfers ?? [] };
    },
  };
}

function formatCursorQuery(params: CursorPageParams): string {
  const search = new URLSearchParams({ perPage: params.perPage.toString() });
  if (params.cursor !== undefined) search.set("cursor", params.cursor.toString());
  if (params.next !== undefined) search.set("next", params.next ? "true" : "false");
  return `?${search.toString()}`;
}
