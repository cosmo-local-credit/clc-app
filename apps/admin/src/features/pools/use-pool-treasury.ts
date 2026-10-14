import type { UserPool } from "@clc/api/features/pools/client";
import { limiterLimitOfAbi } from "@clc/core/features/pool-admin/logic";
import {
  erc20BalanceOfAbi,
  poolAvailableLiquidityRaw,
  swapPoolFeesAbi,
  swapPoolFeesDecoupledAbi,
} from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { type ContractFunctionParameters, isAddress } from "viem";
import { multicall } from "viem/actions";
import { poolKeys } from "@clc/api/features/pools/queries";
import { CHAIN_ID } from "#/lib/chain";
import { getChainClient } from "#/lib/chain-client";

export type PoolTokenTreasury = {
  /** What the pool holds of the token. */
  balanceRaw: string;
  /** Pool fees accrued in the token, awaiting collection. */
  feesRaw: string;
  /**
   * What `withdrawLiquidity` will actually release. In decoupled mode accrued
   * fees are reserved and the call reverts `InsufficientBalance` if they are
   * included, so the two figures are shown apart rather than summed.
   */
  withdrawableRaw: string;
  /**
   * The limiter's `limitOf(token, pool)`, read in the same block as the balance
   * it is measured against. Null when the pool has no limiter or the read
   * failed — an unknown cap, which is not a zero one.
   */
  limitRaw: string | null;
};

/**
 * What each of a pool's vouchers is worth to its owner right now, and how much
 * more of it the pool will take, keyed by lowercased token address.
 *
 * Read from the chain rather than the catalog because every figure here moves
 * on chain first, and the calls this feeds revert on a stale number:
 * `withdraw(token)` throws `InsufficientFees` on a zero balance,
 * `withdrawLiquidity` throws `InsufficientBalance` past the free balance, and a
 * deposit reverts `LimitExceeded` against the limiter's cap — which the
 * catalog's `tokenLimit` can misstate, since it is the indexer's projection of
 * `LimitSet` rather than the limit itself.
 */
export function usePoolTreasury(
  pool: UserPool | null | undefined,
  addresses: readonly string[],
  enabled: boolean,
) {
  const poolAddress = pool?.address && isAddress(pool.address) ? pool.address : undefined;
  const limiterAddress =
    pool?.limiterAddress && isAddress(pool.limiterAddress) ? pool.limiterAddress : undefined;
  // Two reads per token, or three where a limiter has a cap to report.
  const stride = limiterAddress ? 3 : 2;
  // Stable and unique: a catalog voucher and an indexer-discovered holding can
  // name the same token, and paging either source must not refetch an identical
  // treasury snapshot in a different order.
  const tokenAddresses = [
    ...new Set(
      addresses.filter((address) => isAddress(address)).map((address) => address.toLowerCase()),
    ),
  ].sort();

  return useQuery({
    queryKey: [
      ...poolKeys.all,
      "treasury",
      pool?.chainId ?? CHAIN_ID,
      poolAddress,
      limiterAddress,
      tokenAddresses,
    ],
    queryFn: async () => {
      if (!poolAddress) throw new Error("The pool treasury read is missing a pool address.");
      const client = getChainClient(pool?.chainId ?? CHAIN_ID);
      const contracts: ContractFunctionParameters[] = [
        {
          address: poolAddress,
          abi: swapPoolFeesDecoupledAbi,
          functionName: "feesDecoupled",
        },
        ...tokenAddresses.flatMap<ContractFunctionParameters>((address) => [
          {
            address: address as `0x${string}`,
            abi: erc20BalanceOfAbi,
            functionName: "balanceOf",
            args: [poolAddress],
          },
          {
            address: poolAddress,
            abi: swapPoolFeesAbi,
            functionName: "fees",
            args: [address as `0x${string}`],
          },
          ...(limiterAddress
            ? [
                {
                  address: limiterAddress,
                  abi: limiterLimitOfAbi,
                  functionName: "limitOf",
                  args: [address as `0x${string}`, poolAddress],
                },
              ]
            : []),
        ]),
      ];
      const results = await multicall(client, {
        allowFailure: true,
        // Disable viem's size-based splitting: balances, fees and caps must
        // come from one eth_call even when the pool holds many vouchers.
        batchSize: 0,
        // One Multicall3 eth_call gives every row a same-block snapshot. The
        // contract's immutable mode leads the batch so a sparse catalog row
        // cannot silently coerce an actually-decoupled pool to `false`.
        contracts,
      });

      const feeModeRead = results[0];
      if (feeModeRead?.status !== "success" || typeof feeModeRead.result !== "boolean") {
        throw new Error("The pool treasury fee mode read returned an invalid value.");
      }
      const feesDecoupled = feeModeRead.result;
      const treasury = new Map<string, PoolTokenTreasury>();
      tokenAddresses.forEach((address, index) => {
        const balanceRead = results[index * stride + 1];
        const feesRead = results[index * stride + 2];
        const limitRead = limiterAddress ? results[index * stride + 3] : undefined;
        // One malformed token must not make every healthy holding unknown. A
        // skipped row can still use the indexer's gross balance, but it cannot
        // claim any of that balance is available liquidity.
        if (
          balanceRead?.status !== "success" ||
          typeof balanceRead.result !== "bigint" ||
          feesRead?.status !== "success" ||
          typeof feesRead.result !== "bigint"
        ) {
          return;
        }
        const balanceRaw = balanceRead.result.toString();
        const feesRaw = feesRead.result.toString();
        treasury.set(address, {
          balanceRaw,
          feesRaw,
          withdrawableRaw: poolAvailableLiquidityRaw({
            balanceRaw,
            feesRaw,
            feesDecoupled,
          }),
          // A failed cap read leaves the balance usable; the caller falls back
          // to the catalog's recorded cap.
          limitRaw:
            limitRead?.status === "success" && typeof limitRead.result === "bigint"
              ? limitRead.result.toString()
              : null,
        });
      });
      return treasury;
    },
    enabled: enabled && !!poolAddress && tokenAddresses.length > 0,
    retry: false,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
