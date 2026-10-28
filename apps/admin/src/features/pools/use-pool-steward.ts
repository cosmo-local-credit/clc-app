import type { UserPool } from "@clc/api/features/pools/client";
import { poolKeys } from "@clc/api/features/pools/queries";
import {
  feePolicyDefaultFeeAbi,
  oracleQuoterPolicyAbi,
  ownableAbi,
  swapPoolFeeAddressAbi,
  swapPoolSealAbi,
} from "@clc/core/features/pool-admin/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { readContract } from "viem/actions";

import { CHAIN_ID } from "#/lib/chain";
import { getChainClient } from "#/lib/chain-client";

export type PoolStewardState = {
  sealState: number | null;
  feeAddress: `0x${string}` | null;
  owner: `0x${string}` | null;
  defaultFeePpm: string | null;
  maxStaleness: string | null;
  multiplierPpm: string | null;
};

/**
 * The chain values a steward changes, which the catalog does not store:
 * seal bits, the live fee recipient, the default fee, and oracle policy.
 */
export function usePoolStewardState(pool: UserPool | null | undefined) {
  const address = pool?.address && isAddress(pool.address) ? pool.address : undefined;
  const feePolicy =
    pool?.feePolicyAddress && isAddress(pool.feePolicyAddress) ? pool.feePolicyAddress : undefined;
  const quoter =
    pool?.quoterType === "oracle" && pool.quoterAddress && isAddress(pool.quoterAddress)
      ? pool.quoterAddress
      : undefined;

  return useQuery({
    queryKey: [
      ...poolKeys.all,
      "steward",
      address ?? "none",
      feePolicy ?? "none",
      quoter ?? "none",
    ],
    enabled: Boolean(address),
    staleTime: 15_000,
    queryFn: async (): Promise<PoolStewardState> => {
      const client = getChainClient(pool?.chainId ?? CHAIN_ID);
      const poolAddress = address as `0x${string}`;
      const [sealState, feeAddress, owner, defaultFee, maxStaleness, multiplier] =
        await Promise.all([
          readOptionalNumber(client, poolAddress, swapPoolSealAbi, "sealState"),
          readOptionalAddress(client, poolAddress, swapPoolFeeAddressAbi, "feeAddress"),
          readOptionalAddress(client, poolAddress, ownableAbi, "owner"),
          feePolicy
            ? readOptionalBigint(client, feePolicy, feePolicyDefaultFeeAbi, "getDefaultFee")
            : Promise.resolve(null),
          quoter
            ? readOptionalBigint(client, quoter, oracleQuoterPolicyAbi, "maxStaleness")
            : Promise.resolve(null),
          quoter
            ? readOptionalBigint(client, quoter, oracleQuoterPolicyAbi, "multiplier")
            : Promise.resolve(null),
        ]);
      return {
        sealState,
        feeAddress,
        owner,
        defaultFeePpm: defaultFee,
        maxStaleness,
        multiplierPpm: multiplier,
      };
    },
  });
}

type ReadClient = ReturnType<typeof getChainClient>;

async function readOptionalNumber(
  client: ReadClient,
  address: `0x${string}`,
  abi: readonly unknown[],
  functionName: string,
): Promise<number | null> {
  try {
    const value = (await readContract(client, {
      address,
      abi: abi as never,
      functionName,
    })) as unknown;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

async function readOptionalAddress(
  client: ReadClient,
  address: `0x${string}`,
  abi: readonly unknown[],
  functionName: string,
): Promise<`0x${string}` | null> {
  try {
    const value = (await readContract(client, {
      address,
      abi: abi as never,
      functionName,
    })) as unknown;
    return typeof value === "string" && isAddress(value) ? value : null;
  } catch {
    return null;
  }
}

async function readOptionalBigint(
  client: ReadClient,
  address: `0x${string}`,
  abi: readonly unknown[],
  functionName: string,
): Promise<string | null> {
  try {
    const value = (await readContract(client, {
      address,
      abi: abi as never,
      functionName,
    })) as unknown;
    return typeof value === "bigint" ? value.toString() : null;
  } catch {
    return null;
  }
}
