import { ownedVouchersInfiniteQueryOptions } from "@clc/api/features/vouchers/owned-queries";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ownedVouchersClient } from "#/lib/api/owned-vouchers";

const OWNED_VOUCHER_PAGE_SIZE = 100;
const WALLET_OWNED_VOUCHER_REFETCH_INTERVAL_MS = 5_000;

/** Every voucher currently owned by the authenticated wallet, including retired rows. */
export function useAllOwnedVouchers(
  address: string | undefined,
  { poll = false }: { poll?: boolean } = {},
) {
  const query = useInfiniteQuery({
    ...ownedVouchersInfiniteQueryOptions(ownedVouchersClient, address, OWNED_VOUCHER_PAGE_SIZE),
    refetchInterval: poll ? WALLET_OWNED_VOUCHER_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const { fetchNextPage, hasNextPage, isError, isFetchingNextPage } = query;

  useEffect(() => {
    if (isError || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage]);

  return {
    ...query,
    vouchers: query.data?.pages.flatMap((page) => page.vouchers) ?? [],
    isPending: query.isPending || hasNextPage || isFetchingNextPage,
  };
}
