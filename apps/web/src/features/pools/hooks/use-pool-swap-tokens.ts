import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { limiterLimitOfAbi } from "@clc/core/features/pool-admin/logic";
import { erc20BalanceOfAbi, swapPoolFeesAbi } from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { getBlockNumber, multicall } from "viem/actions";
import { useClient } from "wagmi";

import type { PoolSwapTokenReads } from "#/features/pools/logic/pool-swap-tokens";

export const poolSwapTokenQueryKeys = {
  all: ["pool-swap-tokens"] as const,
  reads: (poolAddress: string, holderAddress: string, tokenAddresses: readonly string[]) =>
    [
      "pool-swap-tokens",
      poolAddress.toLowerCase(),
      holderAddress.toLowerCase(),
      tokenAddresses,
    ] as const,
};

/** Reads per voucher: holder balance, pool balance, accrued fees, limiter cap. */
const READS_PER_VOUCHER = 4;

/**
 * Everything the swap screen needs to know about a pool's vouchers that only the
 * chain can answer, in one multicall.
 *
 * Four reads a voucher, batched: what you hold, what the pool holds, the fees
 * reserved against that balance, and the limiter's cap on it. They belong
 * together because the screen consumes them together — a From row needs your
 * balance and the pool's headroom, a To row needs the pool's liquidity, and
 * splitting them across queries would show a picker whose two columns disagree
 * about which block they were read at.
 *
 * `allowFailure: true`: a voucher whose contract does not answer degrades to a
 * row with unknown figures, rather than emptying the picker for every other
 * voucher in the pool. A pool with no limiter simply contributes no cap read,
 * which is the same thing `mustWithinLimit` does with it.
 */
export function usePoolSwapTokenReads(
  pool: UserPool | null | undefined,
  vouchers: PoolVoucher[],
  holderAddress: string | undefined,
) {
  const client = useClient();
  const poolAddress = pool?.address && isAddress(pool.address) ? pool.address : undefined;
  const holder = holderAddress && isAddress(holderAddress) ? holderAddress : undefined;
  const limiterAddress =
    pool?.limiterAddress && isAddress(pool.limiterAddress) ? pool.limiterAddress : undefined;
  // Sorted so the key does not change — and the query does not refetch — when the
  // catalog pages a pool's vouchers back in a different order.
  const tokenAddresses = vouchers
    .map((voucher) => voucher.tokenAddress)
    .filter((address) => isAddress(address))
    .map((address) => address.toLowerCase())
    .sort();

  const query = useQuery({
    queryKey: poolSwapTokenQueryKeys.reads(poolAddress ?? "none", holder ?? "none", tokenAddresses),
    queryFn: async () => {
      if (!client || !poolAddress || !holder) {
        throw new Error("The pool swap token read is missing a client.");
      }
      const blockNumber = await getBlockNumber(client);
      const results = await multicall(client, {
        allowFailure: true,
        blockNumber,
        contracts: tokenAddresses.flatMap((address) => [
          {
            address: address as `0x${string}`,
            abi: erc20BalanceOfAbi,
            functionName: "balanceOf" as const,
            args: [holder],
          },
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
          // Addressed to the pool itself when there is no limiter, so the reads
          // stay a fixed stride per voucher; `limitRaw` then reads back null and
          // `poolDepositCap` answers "uncapped" from `limiterAddress` alone.
          {
            address: limiterAddress ?? poolAddress,
            abi: limiterLimitOfAbi,
            functionName: "limitOf" as const,
            args: [address as `0x${string}`, poolAddress],
          },
        ]),
      });

      return {
        blockNumber,
        reads: new Map<string, PoolSwapTokenReads>(
          tokenAddresses.map((address, index) => {
            const base = index * READS_PER_VOUCHER;
            return [
              address,
              {
                holderBalanceRaw: rawAmount(results[base]),
                poolBalanceRaw: rawAmount(results[base + 1]),
                feesRaw: rawAmount(results[base + 2]),
                limitRaw: limiterAddress ? optionalRawAmount(results[base + 3]) : null,
              },
            ];
          }),
        ),
      };
    },
    enabled: !!client && !!poolAddress && !!holder && tokenAddresses.length > 0,
    retry: false,
    staleTime: 15_000,
  });

  return { ...query, data: query.data?.reads, blockNumber: query.data?.blockNumber };
}

type MulticallEntry = { status: "success"; result: unknown } | { status: "failure" } | undefined;

/** A failed balance read is zero: the row lists, unheld, rather than vanishing. */
function rawAmount(entry: MulticallEntry): string {
  return optionalRawAmount(entry) ?? "0";
}

/** A failed cap read is null — an unknown ceiling, which is not a closed one. */
function optionalRawAmount(entry: MulticallEntry): string | null {
  if (entry?.status !== "success" || typeof entry.result !== "bigint") return null;
  return entry.result.toString();
}
