import { useMemo, useState } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { useAccountTransfersInfinite } from "./use-account-balances";

/**
 * The viewer's transfers of one voucher, revealed three at a time. The account
 * feed is shared with the wallet, so a page of it is filtered here and the next
 * page is fetched only once the filtered rows run out.
 */
export function useVoucherTransfers(contractAddress: string) {
  const auth = useAuthStatus();
  const accountAddress = auth.isAuthenticated ? auth.session?.address : undefined;
  const transfersQuery = useAccountTransfersInfinite(accountAddress, { poll: true });
  const [visibleCount, setVisibleCount] = useState(3);
  const transfers = useMemo(() => {
    const allTransfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];
    return allTransfers.filter(
      (transfer) => transfer.tokenAddress.toLowerCase() === contractAddress.toLowerCase(),
    );
  }, [contractAddress, transfersQuery.data]);

  function loadMore() {
    if (visibleCount >= transfers.length && transfersQuery.hasNextPage) {
      void Promise.resolve(transfersQuery.fetchNextPage()).then(() =>
        setVisibleCount((current) => current + 3),
      );
      return;
    }
    setVisibleCount((current) => current + 3);
  }

  return {
    accountAddress,
    transfersQuery,
    transfers,
    visibleTransfers: transfers.slice(0, visibleCount),
    hasMoreTransfers: visibleCount < transfers.length || transfersQuery.hasNextPage,
    loadMore,
  };
}
