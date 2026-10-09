import type { UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import {
  poolParityPriceIndex,
  relativeQuoterPriceIndexAbi,
} from "@clc/core/features/pool-admin/logic";
import { useQuery } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import { multicall, readContract } from "viem/actions";
import { CHAIN_ID } from "#/lib/chain";
import { getChainClient } from "#/lib/chain-client";

export function usePoolPricing(pool: UserPool | undefined) {
  const probe = useQuery({
    queryKey: [...poolKeys.all, "quoter-kind", pool?.chainId ?? CHAIN_ID, pool?.quoterAddress],
    queryFn: async () => {
      if (!pool?.quoterAddress) throw new Error("No quoter address recorded.");
      await readContract(getChainClient(pool.chainId ?? CHAIN_ID), {
        address: pool.quoterAddress,
        abi: relativeQuoterPriceIndexAbi,
        functionName: "priceIndex",
        args: [zeroAddress],
      });
      return "relative" as const;
    },
    enabled: !pool?.quoterType && !!pool?.quoterAddress,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return pool?.quoterType ?? probe.data ?? null;
}

export function usePoolRates(pool: UserPool, addresses: readonly string[], enabled: boolean) {
  const tokens = [...new Set(addresses.map((address) => address.toLowerCase()))].sort();
  return useQuery({
    queryKey: [...poolKeys.all, "rates", pool.chainId ?? CHAIN_ID, pool.quoterAddress, tokens],
    queryFn: async () => {
      if (!pool.quoterAddress) throw new Error("No quoter address recorded.");
      const quoterAddress = pool.quoterAddress;
      const reads = await multicall(getChainClient(pool.chainId ?? CHAIN_ID), {
        allowFailure: true,
        contracts: tokens.map((address) => ({
          address: quoterAddress,
          abi: relativeQuoterPriceIndexAbi,
          functionName: "priceIndex" as const,
          args: [address as `0x${string}`],
        })),
      });
      // Failed reads are unknown. Only an actual stored zero proves parity.
      return Object.fromEntries(
        tokens.map((address, index) => {
          const read = reads[index];
          return [
            address,
            read?.status === "success"
              ? read.result > 0n
                ? read.result.toString()
                : poolParityPriceIndex()
              : null,
          ];
        }),
      );
    },
    enabled: enabled && !!pool.quoterAddress && tokens.length > 0,
    retry: false,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
