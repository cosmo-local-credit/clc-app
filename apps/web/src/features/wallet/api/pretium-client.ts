import { apiFetch } from "#/features/auth/api/client";

export type PretiumAsset = "USDT" | "USDC" | "cUSD";

export type TriggerPretiumOnrampInput = {
  address: `0x${string}`;
  phoneNumber?: string;
  asset: PretiumAsset;
  amount: number;
};

export type PretiumOnrampResult = {
  transactionCode: string;
  status: string;
  message?: string;
};

export type PretiumRatesResult = {
  buy: string;
  sell: string;
};

export type PretiumCashTransactionKind = "onramp" | "offramp";

export type PretiumCashTransaction = {
  kind: PretiumCashTransactionKind;
  id: number | null;
  reference: string;
  status: string;
  mpesaConfirmation: string | null;
  phoneNumber: string;
  amountUsd: string;
  amountKes: string;
  txHash: string;
  tokenAddress: string;
  walletAddress: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PretiumTransactionsByAddressResult = {
  address: string;
  onramps: PretiumCashTransaction[];
  offramps: PretiumCashTransaction[];
  totalCount: number;
};

type PretiumRatesResponse = {
  buy?: unknown;
  sell?: unknown;
};

type PretiumTransactionsByAddressResponse = {
  address?: unknown;
  onramps?: unknown;
  offramps?: unknown;
  totalCount?: unknown;
};

const PRETIUM_GET_REQUEST: RequestInit = {
  method: "GET",
  cache: "no-store",
};

export async function triggerPretiumOnramp(
  input: TriggerPretiumOnrampInput,
): Promise<PretiumOnrampResult> {
  const result = await apiFetch<Partial<PretiumOnrampResult>>("/api/v2/pretium/trigger-onramp", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return {
    transactionCode: readString(result, "transactionCode") || readString(result, "pretium_id"),
    status: readString(result, "status") || "PENDING",
    message: readOptionalString(result, "message") ?? undefined,
  };
}

export type PretiumLinkStatus = {
  linked: boolean;
  phoneNumber: string;
};

export type CreatePretiumLinkInput = {
  publicKey: `0x${string}`;
  phoneNumber: string;
};

type PretiumLinkStatusResponse = {
  linked?: unknown;
  phoneNumber?: unknown;
};

export async function getPretiumLinkByAddress(address: `0x${string}`): Promise<PretiumLinkStatus> {
  const result = await apiFetch<PretiumLinkStatusResponse>(
    `/api/v2/pretium/link-by-address/${address}`,
    PRETIUM_GET_REQUEST,
  );
  return {
    linked: result.linked === true,
    phoneNumber: formatValue(result.phoneNumber),
  };
}

export async function createPretiumLink(input: CreatePretiumLinkInput): Promise<void> {
  await apiFetch("/api/v2/pretium/link", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPretiumRates(): Promise<PretiumRatesResult> {
  const result = await apiFetch<PretiumRatesResponse>("/api/v2/pretium/rates", PRETIUM_GET_REQUEST);
  return {
    buy: formatValue(result.buy),
    sell: formatValue(result.sell),
  };
}

export async function getPretiumTransactionsByAddress(
  address: `0x${string}`,
): Promise<PretiumTransactionsByAddressResult> {
  const result = await apiFetch<PretiumTransactionsByAddressResponse>(
    `/api/v2/pretium/transactions-by-address/${address}`,
    PRETIUM_GET_REQUEST,
  );
  const onramps = readTransactionArray(result.onramps, "onramp");
  const offramps = readTransactionArray(result.offramps, "offramp");
  return {
    address: formatValue(result.address) || address,
    onramps,
    offramps,
    totalCount: readNumber(result, "totalCount") ?? onramps.length + offramps.length,
  };
}

function readTransactionArray(
  value: unknown,
  kind: PretiumCashTransactionKind,
): PretiumCashTransaction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [normalizeTransaction(item, kind)];
  });
}

function normalizeTransaction(
  record: Record<string, unknown>,
  kind: PretiumCashTransactionKind,
): PretiumCashTransaction {
  return {
    kind,
    id: readNumberFromKeys(record, ["id", "ID"]),
    reference: readStringFromKeys(record, ["pretium_id", "pretiumId", "PretiumID"]),
    status:
      readStringFromKeys(record, ["pretium_status", "pretiumStatus", "PretiumStatus"]) || "PENDING",
    mpesaConfirmation: readOptionalStringFromKeys(record, [
      "mpesa_confirmation",
      "mpesaConfirmation",
      "MpesaConfirmation",
    ]),
    phoneNumber: readStringFromKeys(record, ["phone_number", "phoneNumber", "PhoneNumber"]),
    amountUsd: readStringFromKeys(record, ["amount_usd", "amountUsd", "AmountUSD"]),
    amountKes: readStringFromKeys(record, ["amount_kes", "amountKes", "AmountKES"]),
    txHash: readStringFromKeys(record, ["tx_hash", "txHash", "TxHash"]),
    tokenAddress: readStringFromKeys(record, ["token_address", "tokenAddress", "TokenAddress"]),
    walletAddress: readOptionalStringFromKeys(record, [
      "wallet_address",
      "walletAddress",
      "WalletAddress",
    ]),
    createdAt: readStringFromKeys(record, ["created_at", "createdAt", "CreatedAt"]),
    updatedAt: readStringFromKeys(record, ["updated_at", "updatedAt", "UpdatedAt"]),
  };
}

function readString(record: Record<string, unknown>, key: string): string {
  return formatValue(record[key]);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = formatValue(record[key]);
  return value || null;
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  return typeof record[key] === "number" ? record[key] : null;
}

function readStringFromKeys(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = formatValue(record[key]);
    if (value) return value;
  }
  return "";
}

function readOptionalStringFromKeys(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  const value = readStringFromKeys(record, keys);
  return value || null;
}

function readNumberFromKeys(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (typeof record[key] === "number") return record[key];
  }
  return null;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
