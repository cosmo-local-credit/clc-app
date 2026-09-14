import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { erc20BalanceOfAbi, swapPoolFeesAbi } from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
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
  vouchers: PoolVoucher[],
  enabled: boolean,
) {
  const client = useClient();
  const poolAddress = pool?.address && isAddress(pool.address) ? pool.address : undefined;
  const tokenAddresses = vouchers
    .map((voucher) => voucher.tokenAddress)
    .filter((address) => isAddress(address))
    .map((address) => address.toLowerCase());
  const feesDecoupled = pool?.feesDecoupled ?? false;

  return useQuery({
    queryKey: poolTreasuryQueryKeys.pool(poolAddress ?? "none", tokenAddresses),
    queryFn: async () => {
      if (!client || !poolAddress) throw new Error("The pool treasury read is missing a client.");
      const results = await multicall(client, {
        allowFailure: false,
        contracts: tokenAddresses.flatMap((address) => [
          {
            address: address as `0x${string}`,
            abi: erc20BalanceOfAbi,
            functionName: "balanceOf" as const,
            args: [poolAddress],
          },
          {
            address: poolAddress,
            abi: swapPoolFeesAbi,
            functionName: "fees" as const,
            args: [address as `0x${string}`],
          },
        ]),
      });

      return new Map<string, PoolTokenTreasury>(
        tokenAddresses.map((address, index) => {
          const balance = results[index * 2] as bigint;
          const fees = results[index * 2 + 1] as bigint;
          const reserved = feesDecoupled ? fees : 0n;
          return [
            address,
            {
              balanceRaw: balance.toString(),
              feesRaw: fees.toString(),
              withdrawableRaw: (balance > reserved ? balance - reserved : 0n).toString(),
            },
          ];
        }),
      );
    },
    enabled: enabled && !!client && !!poolAddress && tokenAddresses.length > 0,
    retry: false,
    staleTime: 15_000,
  });
}
