import type { UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import { oracleQuoterPolicyAbi } from "@clc/core/features/pool-admin/logic";
import { useQuery } from "@tanstack/react-query";
import { getAddress, zeroAddress } from "viem";
import { multicall } from "viem/actions";
import { CHAIN_ID } from "#/lib/chain";
import { getChainClient } from "#/lib/chain-client";

export type PoolVoucherOracleState = {
  /** The aggregator `oracles(token)` returns, EIP-55, or null when none is set. */
  aggregator: `0x${string}` | null;
  /** `oracleMaxStaleness(token)` in seconds; `"0"` is the quoter's global bound. */
  maxStalenessSeconds: string;
};

/**
 * One voucher's feed as the OracleQuoter holds it now.
 *
 * Read from the chain rather than the catalog: the indexer can lag a feed just
 * set, and it never records the per-feed freshness bound at all. An edit compares
 * against this, so a stale catalog cannot turn an unchanged feed into a write.
 */
export function usePoolVoucherOracle(
  pool: UserPool,
  tokenAddress: `0x${string}` | undefined,
  enabled: boolean,
) {
  const chainId = pool.chainId ?? CHAIN_ID;
  return useQuery({
    queryKey: [...poolKeys.all, "voucher-oracle", chainId, pool.quoterAddress, tokenAddress],
    queryFn: async (): Promise<PoolVoucherOracleState> => {
      if (!pool.quoterAddress || !tokenAddress) throw new Error("No quoter address recorded.");
      const [aggregator, maxStaleness] = await multicall(getChainClient(chainId), {
        allowFailure: false,
        contracts: [
          {
            address: pool.quoterAddress,
            abi: oracleQuoterPolicyAbi,
            functionName: "oracles",
            args: [tokenAddress],
          },
          {
            address: pool.quoterAddress,
            abi: oracleQuoterPolicyAbi,
            functionName: "oracleMaxStaleness",
            args: [tokenAddress],
          },
        ],
      });
      return {
        aggregator: aggregator === zeroAddress ? null : getAddress(aggregator),
        maxStalenessSeconds: maxStaleness.toString(),
      };
    },
    enabled: enabled && !!pool.quoterAddress && !!tokenAddress,
    retry: false,
    staleTime: 0,
  });
}
