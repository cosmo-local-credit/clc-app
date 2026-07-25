import type { WalletToken } from "#/components/wallet";
import type { PoolVoucher } from "#/features/pools/api/pools-client";
import type { AccountToken } from "#/features/wallet/api/account-client";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";

export function poolVoucherToWalletToken(
  voucher: PoolVoucher,
  accountToken?: AccountToken,
): WalletToken {
  return accountTokenToWalletToken({
    id: accountToken?.id ?? 0,
    tokenAddress: voucher.tokenAddress,
    tokenSymbol: voucher.symbol,
    tokenName: voucher.name,
    tokenDecimals: accountToken?.tokenDecimals ?? voucher.decimals ?? 18,
    balance: accountToken?.balance ?? "0",
    iconUrl: accountToken?.iconUrl ?? voucher.iconUrl,
    lastDateBlock: accountToken?.lastDateBlock ?? voucher.updatedAt ?? voucher.createdAt ?? "",
  });
}
