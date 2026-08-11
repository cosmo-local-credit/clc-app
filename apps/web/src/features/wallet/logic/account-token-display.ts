import { formatTokenAmount } from "@clc/core/features/wallet/logic";

import type { AccountToken } from "@clc/api/features/accounts/client";
import type { WalletToken } from "#/components/wallet/wallet-data";

export function accountTokenToWalletToken(token: AccountToken): WalletToken {
  return {
    id: token.tokenAddress.toLowerCase(),
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
  };
}

function colorFromSeed(seed: string): string {
  let hue = 0;
  for (let i = 0; i < seed.length; i++) {
    hue = (hue * 31 + seed.charCodeAt(i)) % 360;
  }
  return `oklch(0.58 0.16 ${hue})`;
}
