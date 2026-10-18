import type { AccountToken } from "@clc/api/features/accounts/client";
import type { OwnedVoucher } from "@clc/api/features/vouchers/owned-client";
import type { WalletToken } from "#/components/wallet/wallet-data";
import { accountTokenToWalletToken, tokenColorFromSeed } from "./account-token-display";

export type WalletVoucherBalanceState = "ready" | "loading" | "unavailable";
export type WalletVoucherListItem = WalletToken & {
  balanceState: WalletVoucherBalanceState;
};

export function groupWalletVouchers(
  owned: readonly OwnedVoucher[],
  balances: readonly AccountToken[],
  balanceState: Exclude<WalletVoucherBalanceState, "ready"> | "complete",
): { holdings: WalletVoucherListItem[]; owned: WalletVoucherListItem[] } {
  const ownedAddresses = new Set(owned.map((voucher) => voucher.address.toLowerCase()));
  const balancesByAddress = new Map(
    balances.map((token) => [token.tokenAddress.toLowerCase(), token] as const),
  );

  const holdings = balances
    .filter(
      (token) =>
        token.catalogActive !== false && !ownedAddresses.has(token.tokenAddress.toLowerCase()),
    )
    .map((token) => ({ ...accountTokenToWalletToken(token), balanceState: "ready" as const }));

  const ownedRows = owned.map((voucher): WalletVoucherListItem => {
    const balance = balancesByAddress.get(voucher.address.toLowerCase());
    if (balance) {
      return {
        ...accountTokenToWalletToken(balance),
        catalogActive: voucher.active,
        name: voucher.name,
        symbol: voucher.symbol,
        iconUrl: voucher.iconUrl ?? balance.iconUrl,
        owner: voucher.ownerAddress,
        admin: true,
        balanceState: "ready",
      };
    }
    return {
      id: voucher.address.toLowerCase(),
      catalogActive: voucher.active,
      symbol: voucher.symbol,
      name: voucher.name,
      amount: "0",
      fiat: "",
      color: tokenColorFromSeed(voucher.address),
      kind: "voucher",
      admin: true,
      owner: voucher.ownerAddress,
      contractAddress: voucher.address,
      iconUrl: voucher.iconUrl,
      tokenDecimals: voucher.decimals ?? undefined,
      balance: balanceState === "complete" ? "0" : undefined,
      balanceState: balanceState === "complete" ? "ready" : balanceState,
    };
  });

  return { holdings, owned: ownedRows };
}
