import { useMemo, useState } from "react";

import { useAccountTransfersInfinite } from "./use-account-balances";

/**
 * The viewer's transfers of one voucher, revealed three at a time. The account
 * feed is shared with the wallet, so a page of it is filtered here and the next
 * page is fetched only once the filtered rows run out.
 */
export function useVoucherTransfers(accountAddress: string | undefined, contractAddress: string) {
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
    transfersQuery,
    transfers,
    visibleTransfers: transfers.slice(0, visibleCount),
    hasMoreTransfers: visibleCount < transfers.length || transfersQuery.hasNextPage,
    loadMore,
  };
}
