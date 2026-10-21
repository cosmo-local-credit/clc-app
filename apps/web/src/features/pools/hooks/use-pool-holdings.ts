import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";

import {
  usePoolQuoterKind,
  usePoolVoucherRatesByAddress,
} from "#/features/pools/hooks/use-pool-quoter";
import { usePoolTreasury } from "#/features/pools/hooks/use-pool-treasury";
import { buildPoolHoldings } from "#/features/pools/logic/pool-holdings";
import { useAccountTokensInfinite } from "#/features/wallet/hooks/use-account-balances";

/**
 * Every voucher the pool holds or lists, valued and capped, for the holdings
 * and credit tabs alike.
 *
 * Reads the chain rather than the catalog for the balances and the caps: both
 * move on chain first, and the figure a reader is about to deposit against has
 * to be the one the contract will check. The catalog still supplies the names
 * and the icons, and the cap where the chain read did not answer.
 */
export function usePoolHoldings(pool: UserPool, vouchers: PoolVoucher[]) {
  // The account page discovers tokens the catalog has not projected. Feed the
  // union into the same-block treasury multicall so those rows do not fall back
  // to a gross balance that may include reserved fees.
  const indexed = useAccountTokensInfinite(pool.address);
  const indexedTokens = indexed.data?.pages.flatMap((page) => page.tokens);
  const treasury = usePoolTreasury(
    pool,
    [
      ...vouchers.map((voucher) => voucher.tokenAddress),
      ...(indexedTokens ?? []).map((token) => token.tokenAddress),
    ],
    true,
  );
  // RelativeQuoter supplies exact per-voucher rates. Decimal pools are defined
  // as equal-value and need no read; oracle pools cannot price arbitrary custom
  // units here and remain unavailable.
  const quoter = usePoolQuoterKind(pool);
  const isRelative = quoter.kind === "relative";
  const isDecimal = quoter.kind === "decimal";
  const rateAddresses = [
    ...vouchers.map((voucher) => voucher.tokenAddress),
    ...(indexedTokens ?? []).map((token) => token.tokenAddress),
  ];
  const rates = usePoolVoucherRatesByAddress(pool, rateAddresses, isRelative, {
    failOnReadError: true,
  });
  // The indexer's view of the same address carries the vouchers the catalog
  // has not projected — a pool seeded at `initialize` holds tokens no catalog
  // row mentions, and a screen that dropped them would report a pool as emptier
  // than it is.
  const holdings = buildPoolHoldings({
    pool,
    vouchers,
    treasury: treasury.data,
    indexedTokens,
    rates: isRelative ? rates.data : undefined,
    priced: isRelative || isDecimal,
    requireRates: isRelative,
  });

  return {
    holdings,
    unit: pool.unitOfAccount ?? pool.symbol,
    isPending:
      (treasury.isPending && indexed.isPending && holdings.length === 0) ||
      (isRelative && rateAddresses.length > 0 && rates.isPending),
    /**
     * True until the chain has answered for every token the pool lists. Before
     * then a cap is the catalog's and a headroom is measured against a zero
     * balance, so a screen about credit waits rather than flash a figure it
     * will retract. The indexer is waited on as well because its tokens re-key
     * the treasury read, which would otherwise start over once rows were up.
     * `isLoading`, not `isPending`, on the treasury: a read with no token to
     * cover never runs, and must not hold the screen forever.
     */
    capsPending:
      indexed.isPending ||
      treasury.isLoading ||
      (isRelative && rateAddresses.length > 0 && rates.isPending),
    isError: (treasury.isError && indexed.isError) || (isRelative && rates.isError),
    isFetching: treasury.isFetching || indexed.isFetching || (isRelative && rates.isFetching),
    refetch: () => {
      void treasury.refetch();
      void indexed.refetch();
      if (isRelative) void rates.refetch();
    },
  };
}
