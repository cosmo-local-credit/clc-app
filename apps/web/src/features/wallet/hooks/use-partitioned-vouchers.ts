import type { WalletToken } from "#/components/wallet";
import { useAllAccountIssuedTokens } from "#/features/wallet/hooks/use-account-balances";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";
import { partitionTokensByIssuer } from "../logic/partition-tokens-by-issuer";

/**
 * Holdings and My Vouchers for one balance list.
 *
 * My Vouchers is the account's issued list, so a voucher it holds none of is
 * still there. That one request also says who issued every balance row, where
 * a catalog read per row used to.
 */
export function usePartitionedVouchers(
  balances: readonly WalletToken[],
  address: string | undefined,
) {
  const issuedQuery = useAllAccountIssuedTokens(address);
  const issued = issuedQuery.tokens.map((token) => ({
    ...accountTokenToWalletToken(token),
    admin: true,
  }));
  return {
    ...partitionTokensByIssuer(balances, issued),
    isPending: issuedQuery.isPending,
    isError: issuedQuery.isError,
    isFetching: issuedQuery.isFetching,
    refetch: issuedQuery.refetch,
  };
}
