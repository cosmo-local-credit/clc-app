import type { RoutedSwapReceipt } from "@clc/api/features/credit-router/client";
import { routedSwapsInfiniteQueryOptions } from "@clc/api/features/credit-router/queries";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { creditRouterClient } from "#/lib/api/credit-router";

/**
 * The wallet's routed exchanges, newest first, indexed by transaction so
 * Activity can show one entry with its hops in place of the indexed swap.
 * Read from the server, so an exchange started on another device or before a
 * refresh is still found. A failed read leaves Activity as it was.
 */
export function useRoutedSwaps(address: string | undefined) {
  const query = useInfiniteQuery({
    ...routedSwapsInfiniteQueryOptions(creditRouterClient, address ?? ""),
    refetchInterval: (current) =>
      current.state.data?.pages.some((page) => page.items.some((item) => !item.settled))
        ? 5_000
        : false,
  });
  const receipts = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const byTxHash = useMemo(() => {
    const index = new Map<string, RoutedSwapReceipt>();
    for (const receipt of receipts) {
      if (receipt.swap.txHash) index.set(receipt.swap.txHash.toLowerCase(), receipt);
    }
    return index;
  }, [receipts]);
  return { receipts, byTxHash };
}
