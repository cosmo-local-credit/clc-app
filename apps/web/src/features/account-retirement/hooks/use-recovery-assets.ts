import { useMemo } from "react";

import { useSafeOwnersSignedBy } from "#/features/ownership/hooks/use-asset-owner-info";
import { useOwnedPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import { usePartitionedVouchers } from "#/features/wallet/hooks/use-partitioned-vouchers";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";

/**
 * What a retiring account holds and owns, for the recovery shell: vouchers held
 * and issued, and the pools it manages.
 *
 * Pools are filtered the way the Wallet filters them. The protected list keeps
 * retired pools reachable for withdrawals, and a row counts as the account's
 * own only when it, or a Safe it signs for, owns it; anything else is a
 * response that ignored the session's scope.
 */
export function useRecoveryAssets(address: `0x${string}`) {
  const balances = useAccountTokensInfinite(address, { poll: true });
  const tokens = useMemo(
    () => balances.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [],
    [balances.data],
  );
  const vouchers = usePartitionedVouchers(tokens, address);

  const poolsQuery = useOwnedPoolsInfinite(address);
  const poolRows = poolsQuery.data?.pages.flatMap((page) => page.pools) ?? [];
  const account = address.toLowerCase();
  const signedSafes = useSafeOwnersSignedBy(
    poolRows.flatMap((pool) =>
      pool.ownerAddress && pool.ownerAddress.toLowerCase() !== account ? [pool.ownerAddress] : [],
    ),
    address,
  );
  const pools = poolRows.filter((pool) => {
    const owner = pool.ownerAddress?.toLowerCase();
    return !!owner && (owner === account || signedSafes.has(owner));
  });

  return {
    holdings: vouchers.holdings,
    issued: vouchers.issued,
    vouchersPending: balances.isPending || vouchers.isPending,
    vouchersError: balances.isError || vouchers.isError,
    retryVouchers: () => {
      void balances.refetch();
      void vouchers.refetch();
    },
    hasMoreBalances: balances.hasNextPage === true,
    fetchingMoreBalances: balances.isFetchingNextPage,
    loadMoreBalances: () => void balances.fetchNextPage(),
    pools,
    poolsPending: poolsQuery.isPending,
    poolsError: poolsQuery.isError,
    retryPools: () => void poolsQuery.refetch(),
    hasMorePools: poolsQuery.hasNextPage === true,
    fetchingMorePools: poolsQuery.isFetchingNextPage,
    loadMorePools: () => void poolsQuery.fetchNextPage(),
  };
}
