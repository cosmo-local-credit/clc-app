import type { UserPool } from "@clc/api/features/pools/client";
import { tokenIndexHaveAbi } from "@clc/core/features/pool-admin/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { readContract } from "viem/actions";
import { useClient } from "wagmi";

export const poolRegistryQueryKeys = {
  all: ["pool-registry"] as const,
  membership: (registryAddress: string, tokenAddress: string) =>
    [
      "pool-registry",
      "membership",
      registryAddress.toLowerCase(),
      tokenAddress.toLowerCase(),
    ] as const,
};

/**
 * Whether the pool's registry already admits this token.
 *
 * Decides whether the approve batch may carry `add`. It is read from the chain
 * rather than inferred from the pool's catalog voucher list, because the two
 * disagree in both directions: a token seeded into the registry when the pool
 * was published, or one the indexer has not projected yet, is a member that the
 * catalog does not list. Sending `add` for it reverts `TokenAlreadyExists` and
 * takes the rate and the limit down with it, since the batch is relayed
 * `revertOnFailure`.
 */
export function usePoolTokenMembership(
  pool: UserPool | null | undefined,
  tokenAddress: string | undefined,
) {
  const client = useClient();
  const registryAddress =
    pool?.tokenRegistryAddress && isAddress(pool.tokenRegistryAddress)
      ? pool.tokenRegistryAddress
      : undefined;
  const token = tokenAddress && isAddress(tokenAddress) ? tokenAddress : undefined;

  return useQuery({
    queryKey: poolRegistryQueryKeys.membership(registryAddress ?? "none", token ?? "none"),
    queryFn: () => {
      if (!client || !registryAddress || !token) {
        throw new Error("The registry membership read is missing a client.");
      }
      return readContract(client, {
        address: registryAddress,
        abi: tokenIndexHaveAbi,
        functionName: "have",
        args: [token],
      });
    },
    enabled: !!client && !!registryAddress && !!token,
    retry: false,
    staleTime: 15_000,
  });
}
