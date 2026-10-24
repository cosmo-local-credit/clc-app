import { useEffect, useMemo } from "react";

import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";
import { usePartitionedVouchers } from "#/features/wallet/hooks/use-partitioned-vouchers";
import { accountTokenToWalletToken } from "#/features/wallet/logic/account-token-display";

const WALLET_VOUCHER_PREVIEW_LIMIT = 5;
const WALLET_VOUCHER_PAGE_SIZE = 20;

/**
 * Builds bounded Wallet previews without letting owned vouchers consume the
 * Holdings slots. Balance pages are read in recency order until five verified
 * non-owned holdings are present or the account is exhausted.
 */
export function useWalletVoucherPreview(address: string | undefined) {
  const balancesQuery = useAccountTokensInfinite(address, {
    perPage: WALLET_VOUCHER_PAGE_SIZE,
    poll: true,
  });
  const balances = useMemo(
    () =>
      balancesQuery.data?.pages.flatMap((page) => page.tokens.map(accountTokenToWalletToken)) ?? [],
    [balancesQuery.data],
  );
  const voucherGroups = usePartitionedVouchers(balances, address);
  const isBalanceError = balancesQuery.isError || balancesQuery.isFetchNextPageError;
  const needsMoreHoldings =
    !voucherGroups.isPending &&
    !voucherGroups.isError &&
    !balancesQuery.isPending &&
    !isBalanceError &&
    voucherGroups.holdings.length < WALLET_VOUCHER_PREVIEW_LIMIT &&
    balancesQuery.hasNextPage === true;

  const { fetchNextPage, isFetchingNextPage } = balancesQuery;
  useEffect(() => {
    if (!needsMoreHoldings || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, isFetchingNextPage, needsMoreHoldings]);

  return {
    holdings: voucherGroups.holdings.slice(0, WALLET_VOUCHER_PREVIEW_LIMIT),
    issued: voucherGroups.issued.slice(0, WALLET_VOUCHER_PREVIEW_LIMIT),
    isPending: voucherGroups.isPending || balancesQuery.isPending || needsMoreHoldings,
    isIssuedError: voucherGroups.isError,
    isBalanceError,
    isFetching: voucherGroups.isFetching || balancesQuery.isFetching,
    refetchIssued: voucherGroups.refetch,
    refetchBalances: () =>
      balancesQuery.isFetchNextPageError ? balancesQuery.fetchNextPage() : balancesQuery.refetch(),
  };
}
