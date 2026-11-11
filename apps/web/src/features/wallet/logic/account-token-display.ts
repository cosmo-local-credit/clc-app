import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { offrampTokenSymbol } from "@clc/core/features/wallet/pretium";

import type { AccountToken } from "@clc/api/features/accounts/client";
import type { WalletToken } from "#/components/wallet/wallet-data";
import { nativeHoldingValue } from "#/features/wallet/logic/holdings-valuation";
import { CHAIN_ID } from "#/lib/chain";

export function accountTokenToWalletToken(token: AccountToken): WalletToken {
  return {
    id: token.tokenAddress.toLowerCase(),
    catalogActive: token.catalogActive,
    symbol: token.tokenSymbol,
    name: token.tokenName,
    amount: formatTokenAmount(token.balance, token.tokenDecimals),
    fiat: "",
    color: colorFromSeed(token.tokenAddress),
    kind: "voucher",
    contractAddress: token.tokenAddress,
    iconUrl: token.iconUrl,
    tokenDecimals: token.tokenDecimals,
    balance: token.balance,
    lastDateBlock: token.lastDateBlock,
    unitValue: nativeHoldingValue(
      formatTokenAmount(token.balance, token.tokenDecimals, token.tokenDecimals),
      offrampTokenSymbol(CHAIN_ID, token.tokenAddress) !== null,
      { value: token.voucherValue ?? null, unit: token.voucherUoa ?? null },
    ),
  };
}

function colorFromSeed(seed: string): string {
  let hue = 0;
  for (let i = 0; i < seed.length; i++) {
    hue = (hue * 31 + seed.charCodeAt(i)) % 360;
  }
  return `oklch(0.58 0.16 ${hue})`;
}
