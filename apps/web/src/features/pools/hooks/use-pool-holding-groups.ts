import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { partitionPoolHoldings } from "@clc/core/features/pools/holdings";

import { usePoolAcceptedVouchers } from "#/features/pools/hooks/use-pool-swap-vouchers";
import { usePoolHoldings } from "#/features/pools/hooks/use-pool-holdings";
import { poolTokenRegistryAddress } from "#/features/pools/hooks/use-pool-registry";

export type PoolVoucherCatalogState = {
  vouchers: PoolVoucher[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  hasData?: boolean;
  refetch: () => unknown;
};

export type AcceptedPoolHolding = {
  holding: ReturnType<typeof usePoolHoldings>["holdings"][number];
  voucher: PoolVoucher;
};

/**
 * The Holdings screen's complete, authoritative membership view.
 *
 * Accepted rows come from the same registry resolver as Swap. Positive Pool
 * balances outside that set are waiting for approval. Older Pools with no
 * registry use their complete catalog as the accepted set.
 */
export function usePoolHoldingGroups(pool: UserPool, catalog: PoolVoucherCatalogState) {
  const acceptedVouchers = usePoolAcceptedVouchers(pool, catalog.vouchers);
  const holdings = usePoolHoldings(pool, acceptedVouchers.vouchers);
  const acceptedByAddress = new Map(
    acceptedVouchers.vouchers.map((voucher) => [voucher.tokenAddress.toLowerCase(), voucher]),
  );
  const grouped = partitionPoolHoldings(holdings.holdings, [...acceptedByAddress.keys()]);
  const hasRegistry = poolTokenRegistryAddress(pool) !== null;

  return {
    ...holdings,
    accepted: grouped.accepted.flatMap((holding): AcceptedPoolHolding[] => {
      const voucher = acceptedByAddress.get(holding.tokenAddress);
      return voucher ? [{ holding, voucher }] : [];
    }),
    pending: grouped.pending,
    verified:
      acceptedVouchers.verified &&
      (hasRegistry || !catalog.isError || catalog.hasData === true || catalog.vouchers.length > 0),
    isPending:
      holdings.isPending || acceptedVouchers.isPending || (!hasRegistry && catalog.isPending),
    isError: holdings.isError || acceptedVouchers.isError || (!hasRegistry && catalog.isError),
    isFetching: holdings.isFetching || acceptedVouchers.isFetching || catalog.isFetching,
    refetch: () => {
      holdings.refetch();
      acceptedVouchers.refetch();
      void catalog.refetch();
    },
  };
}
