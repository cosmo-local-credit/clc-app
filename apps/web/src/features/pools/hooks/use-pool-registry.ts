import type { UserPool } from "@clc/api/features/pools/client";
import {
  tokenIndexEntryAbi,
  tokenIndexEntryCountAbi,
  tokenIndexHaveAbi,
} from "@clc/core/features/pool-admin/logic";
import {
  erc20DecimalsAbi,
  erc20NameAbi,
  erc20SymbolAbi,
} from "@clc/core/features/pool-swaps/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress, zeroAddress } from "viem";
import { getBlockNumber, multicall, readContract } from "viem/actions";
import { useClient } from "wagmi";

import type { RegistryTokenMetadata } from "#/features/pools/logic/pool-swap-tokens";

export const poolRegistryQueryKeys = {
  all: ["pool-registry"] as const,
  membership: (registryAddress: string, tokenAddress: string) =>
    [
      "pool-registry",
      "membership",
      registryAddress.toLowerCase(),
      tokenAddress.toLowerCase(),
    ] as const,
  entries: (registryAddress: string) =>
    ["pool-registry", "entries", registryAddress.toLowerCase()] as const,
  metadata: (tokenAddresses: readonly string[]) =>
    ["pool-registry", "metadata", tokenAddresses] as const,
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
    // Approval uses this read as a race check after selection. Treat a cached
    // answer as stale so reopening or choosing the same voucher revalidates it
    // instead of trusting a recent `false` after another steward approved it.
    staleTime: 0,
  });
}

/**
 * The registry `SwapPool` consults, or null for a pool without one.
 *
 * Unset and the zero address are the same pool to the contract:
 * `mustAllowedToken` returns early on `address(0)` and admits anything. Any other
 * value is a registry, whether or not it reads as a usable address — callers
 * that decide "is there a registry" and callers that read it must agree, or one
 * waits forever on a query the other never enables.
 */
export function poolTokenRegistryAddress(pool: UserPool | null | undefined): string | null {
  const address = pool?.tokenRegistryAddress;
  return address && address.toLowerCase() !== zeroAddress ? address : null;
}

/**
 * Every token the pool's registry admits, in registry order.
 *
 * The complete membership, where the catalog's voucher list is only what clc-core
 * has projected. `entryCount` and every `entry(i)` are read at one block so a
 * concurrent `add` or `remove` cannot shift an index between the two steps, and
 * `allowFailure: false` makes an unreadable entry fail the list: a shorter list
 * presented as complete is the bug this hook exists to close.
 *
 * Idle for a pool with no registry, which admits anything. A registry address
 * that is not a usable address is an error, not "no registry".
 */
export function usePoolRegistryTokens(pool: UserPool | null | undefined) {
  const client = useClient();
  const registryAddress = poolTokenRegistryAddress(pool);

  return useQuery({
    queryKey: poolRegistryQueryKeys.entries(registryAddress ?? "none"),
    queryFn: async () => {
      if (!client || !registryAddress) {
        throw new Error("The registry enumeration is missing a client.");
      }
      if (!isAddress(registryAddress)) {
        throw new Error("The pool's registry address is not a valid address.");
      }
      const blockNumber = await getBlockNumber(client);
      const count = await readContract(client, {
        address: registryAddress,
        abi: tokenIndexEntryCountAbi,
        functionName: "entryCount",
        blockNumber,
      });
      if (count === 0n) return [];
      return multicall(client, {
        allowFailure: false,
        blockNumber,
        contracts: Array.from({ length: Number(count) }, (_, index) => ({
          address: registryAddress,
          abi: tokenIndexEntryAbi,
          functionName: "entry" as const,
          args: [BigInt(index)] as const,
        })),
      });
    },
    enabled: !!client && !!registryAddress,
    retry: false,
    staleTime: 15_000,
  });
}

/** Symbol, name and decimals as the token contracts report them; a field the token will not answer is null. */
export function usePoolTokenMetadata(tokenAddresses: readonly string[]) {
  const client = useClient();
  const addresses = tokenAddresses
    .filter((address) => isAddress(address))
    .map((address) => address.toLowerCase())
    .sort();

  return useQuery({
    queryKey: poolRegistryQueryKeys.metadata(addresses),
    queryFn: async () => {
      if (!client) throw new Error("The token metadata read is missing a client.");
      const results = await multicall(client, {
        allowFailure: true,
        contracts: addresses.flatMap((address) => [
          {
            address: address as `0x${string}`,
            abi: erc20SymbolAbi,
            functionName: "symbol" as const,
          },
          { address: address as `0x${string}`, abi: erc20NameAbi, functionName: "name" as const },
          {
            address: address as `0x${string}`,
            abi: erc20DecimalsAbi,
            functionName: "decimals" as const,
          },
        ]),
      });
      return new Map<string, RegistryTokenMetadata>(
        addresses.map((address, index) => {
          const [symbol, name, decimals] = results.slice(index * 3, index * 3 + 3);
          return [
            address,
            {
              symbol: symbol?.status === "success" ? String(symbol.result) : null,
              name: name?.status === "success" ? String(name.result) : null,
              decimals: decimals?.status === "success" ? Number(decimals.result) : null,
            },
          ];
        }),
      );
    },
    enabled: !!client && addresses.length > 0,
    retry: false,
    staleTime: 60_000,
  });
}
