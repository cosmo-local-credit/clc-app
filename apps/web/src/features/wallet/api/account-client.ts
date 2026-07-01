import { apiFetch } from "#/features/auth/api/client";

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

export type AccountTransferDirection = "IN" | "OUT";

export type AccountTransfer = {
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

export async function getLatestAccountTokens(address: string): Promise<AccountTokensResult> {
  return apiFetch<AccountTokensResult>(`/api/v2/accounts/${address}/tokens/latest`, {
    method: "GET",
  });
}

export async function getAccountTokens(params: CursorPageParams): Promise<AccountTokensResult> {
  return apiFetch<AccountTokensResult>(
    `/api/v2/accounts/${params.address}/tokens${formatCursorQuery(params)}`,
    { method: "GET" },
  );
}

export async function getAccountTransfers(
  params: CursorPageParams,
): Promise<AccountTransfersResult> {
  return apiFetch<AccountTransfersResult>(
    `/api/v2/accounts/${params.address}/transfers${formatCursorQuery(params)}`,
    { method: "GET" },
  );
}

function formatCursorQuery(params: CursorPageParams): string {
  const search = new URLSearchParams({ perPage: params.perPage.toString() });
  if (params.cursor !== undefined) search.set("cursor", params.cursor.toString());
  if (params.next !== undefined) search.set("next", params.next ? "true" : "false");
  return `?${search.toString()}`;
}
