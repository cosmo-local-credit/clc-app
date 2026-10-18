import type { HttpClient } from "../../client/http-client";
import {
  formatCursorQuery,
  normalizeChainId,
  normalizeHex,
  normalizeID,
  normalizeNumber,
  normalizeText,
} from "../../lib/api-normalize";

export type OwnedVoucher = {
  id: string;
  chainId: number;
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number | null;
  iconUrl: string | null;
  ownerAddress: `0x${string}`;
  active: boolean;
};

export type OwnedVoucherPage = {
  vouchers: OwnedVoucher[];
  first?: number;
  last?: number;
  receivedCount: number;
};

type BackendOwnedVoucher = Partial<{
  id: unknown;
  chainId: unknown;
  address: unknown;
  name: unknown;
  symbol: unknown;
  decimals: unknown;
  iconUrl: unknown;
  ownerAddress: unknown;
  active: unknown;
}>;

export type OwnedVouchersClient = ReturnType<typeof createOwnedVouchersClient>;

export function createOwnedVouchersClient(http: HttpClient) {
  return {
    async list(
      params: { perPage: number; cursor?: number; next?: boolean },
      signal?: AbortSignal,
    ): Promise<OwnedVoucherPage> {
      const result = await http.request<{
        vouchers?: BackendOwnedVoucher[] | null;
        first?: unknown;
        last?: unknown;
      }>(`/api/v2/users/me/vouchers${formatCursorQuery(params)}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const received = result.vouchers ?? [];
      return {
        vouchers: received.map(normalizeOwnedVoucher).filter(isOwnedVoucher),
        first: normalizeCursor(result.first),
        last: normalizeCursor(result.last),
        receivedCount: received.length,
      };
    },
  };
}

function normalizeOwnedVoucher(voucher: BackendOwnedVoucher): OwnedVoucher | null {
  const id = normalizeID(voucher.id);
  const chainId = normalizeChainId(voucher.chainId);
  const address = normalizeHex(voucher.address);
  const ownerAddress = normalizeHex(voucher.ownerAddress);
  const name = normalizeText(voucher.name);
  const symbol = normalizeText(voucher.symbol);
  const decimals = normalizeNumber(voucher.decimals);
  const iconUrl = normalizeImageUrl(voucher.iconUrl);
  if (
    !id ||
    chainId === null ||
    !address ||
    !ownerAddress ||
    !name ||
    !symbol ||
    typeof voucher.active !== "boolean" ||
    (decimals !== null && (!Number.isSafeInteger(decimals) || decimals < 0))
  ) {
    return null;
  }
  return {
    id,
    chainId,
    address,
    name,
    symbol,
    decimals,
    iconUrl,
    ownerAddress,
    active: voucher.active,
  };
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

function normalizeCursor(value: unknown): number | undefined {
  const cursor = normalizeNumber(value);
  return cursor !== null && Number.isSafeInteger(cursor) && cursor > 0 ? cursor : undefined;
}

function isOwnedVoucher(value: OwnedVoucher | null): value is OwnedVoucher {
  return value !== null;
}
