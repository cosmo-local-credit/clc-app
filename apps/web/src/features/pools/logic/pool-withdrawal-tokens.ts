import type { AccountToken } from "@clc/api/features/accounts/client";
import type { PoolVoucher } from "@clc/api/features/pools/client";
import { isAddress } from "viem";

/** Withdrawal recovery must include tokens absent from public pool composition. */
export function poolWithdrawalTokens(
  vouchers: readonly PoolVoucher[],
  holdings: readonly AccountToken[],
  chainId: number | null,
): PoolVoucher[] {
  const tokens = new Map(vouchers.map((voucher) => [voucher.tokenAddress.toLowerCase(), voucher]));
  for (const holding of holdings) {
    const address = holding.tokenAddress.toLowerCase();
    if (tokens.has(address) || !isAddress(address)) continue;
    tokens.set(address, {
      id: address,
      chainId,
      tokenAddress: address,
      name: holding.tokenName,
      symbol: holding.tokenSymbol,
      decimals: holding.tokenDecimals,
      description: "",
      ownerAddress: null,
      voucherType: null,
      voucherUoa: null,
      voucherValue: null,
      locationName: null,
      iconUrl: holding.iconUrl,
      bannerUrl: null,
      active: holding.catalogActive !== false,
      internal: false,
      isAllowed: false,
      tokenLimit: null,
      oracleFeedId: null,
      oracleName: null,
      oracleAddress: null,
      offerCount: 0,
      availableOfferCount: 0,
      tags: [],
    });
  }
  return [...tokens.values()];
}
