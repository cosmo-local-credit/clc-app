import type { UserPool } from "@clc/api/features/pools/client";
import {
  erc20BalanceOfAbi,
  poolAvailableLiquidityRaw,
  swapPoolFeesAbi,
  swapPoolFeesDecoupledAbi,
} from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { type ContractFunctionParameters, isAddress } from "viem";
import { multicall } from "viem/actions";
import { useClient } from "wagmi";

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
};

export const poolTreasuryQueryKeys = {
  all: ["pool-treasury"] as const,
  pool: (poolAddress: string, tokenAddresses: readonly string[]) =>
    ["pool-treasury", poolAddress.toLowerCase(), tokenAddresses] as const,
};

/**
 * What each of a pool's vouchers is worth to its owner right now, keyed by
 * lowercased token address.
 *
 * Read from the chain rather than the catalog because both figures move with
 * every swap, and the two withdrawal calls this feeds revert on a stale number:
 * `withdraw(token)` throws `InsufficientFees` on a zero balance, and
 * `withdrawLiquidity` throws `InsufficientBalance` past the free balance.
 */
export function usePoolTreasury(
  pool: UserPool | null | undefined,
  addresses: readonly string[],
  enabled: boolean,
) {
  const client = useClient();
  const poolAddress = pool?.address && isAddress(pool.address) ? pool.address : undefined;
  // Stable and unique: a catalog voucher and an indexer-discovered holding can
  // name the same token, and paging either source must not refetch an identical
  // treasury snapshot in a different order.
  const tokenAddresses = [
    ...new Set(
      addresses.filter((address) => isAddress(address)).map((address) => address.toLowerCase()),
    ),
  ].sort();

  return useQuery({
    queryKey: poolTreasuryQueryKeys.pool(poolAddress ?? "none", tokenAddresses),
    queryFn: async () => {
      if (!client || !poolAddress) throw new Error("The pool treasury read is missing a client.");
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
        ]),
      ];
      const results = await multicall(client, {
        allowFailure: true,
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
        const balanceRead = results[index * 2 + 1];
        const feesRead = results[index * 2 + 2];
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
        });
      });
      return treasury;
    },
    enabled: enabled && !!client && !!poolAddress && tokenAddresses.length > 0,
    retry: false,
    staleTime: 15_000,
  });
}
