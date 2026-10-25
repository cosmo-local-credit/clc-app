import type { UserPool } from "@clc/api/features/pools/client";
import {
  buildTransferPoolOwnershipCalls,
  oracleQuoterBaseCurrencyAbi,
  ownableAbi,
  poolOwnershipWiringAbi,
  poolOwnershipTargets,
  relativeQuoterPriceIndexAbi,
  type PoolOwnershipContracts,
} from "@clc/core/features/pool-admin/logic";
import { type Client, zeroAddress } from "viem";
import { getBlockNumber, getBytecode, multicall, readContract } from "viem/actions";
import { useClient } from "wagmi";

import { readConfirmedAssetOwner } from "#/features/ownership/hooks/use-asset-owner";
import {
  useOwnershipTransfer,
  type OwnershipTransferInput,
} from "#/features/ownership/hooks/use-ownership-transfer";
import { CHAIN_ID } from "#/lib/chain";

import { usePoolAdminRelay } from "./use-pool-admin";

function poolOwnershipContracts(pool: UserPool): PoolOwnershipContracts {
  return {
    poolAddress: pool.address,
    registryAddress: pool.tokenRegistryAddress,
    limiterAddress: pool.limiterAddress,
    feePolicyAddress: pool.feePolicyAddress,
    quoterAddress: pool.quoterAddress,
    protocolFeeControllerAddress: pool.protocolFeeControllerAddress,
    quoterType: pool.quoterType,
  };
}

/** All wiring and owner reads refer to one block, with no cached preflight. */
export async function preparePoolOwnershipTransfer(
  client: Client,
  pool: UserPool,
  input: OwnershipTransferInput,
) {
  if (input.assetAddress.toLowerCase() !== pool.address.toLowerCase())
    throw new Error("Ownership submission does not match this pool.");
  if (pool.chainId !== CHAIN_ID || client.chain?.id !== CHAIN_ID)
    throw new Error("This pool is not on the configured chain.");
  if (pool.ownerAddress?.toLowerCase() !== input.ownerAddress.toLowerCase())
    throw new Error("The catalog owner has changed. Refresh this pool before transferring.");
  const contracts = poolOwnershipContracts(pool);
  const calls = buildTransferPoolOwnershipCalls({ ...contracts, ...input });
  const blockNumber = await getBlockNumber(client, { cacheTime: 0 });
  const wiring = [
    ["tokenRegistry", contracts.registryAddress],
    ["tokenLimiter", contracts.limiterAddress],
    ["feePolicy", contracts.feePolicyAddress],
    ["quoter", contracts.quoterAddress],
    ["protocolFeeController", contracts.protocolFeeControllerAddress ?? zeroAddress],
  ] as const;
  await Promise.all(
    wiring.map(async ([functionName, expected]) => {
      const actual = await readContract(client, {
        address: pool.address,
        abi: poolOwnershipWiringAbi,
        functionName,
        blockNumber,
      });
      if (actual.toLowerCase() !== expected?.toLowerCase())
        throw new Error(
          `The pool's ${functionName} differs from its catalog record. Ask support to reconcile the wiring.`,
        );
    }),
  );
  // A mislabeled decimal quoter must not silently retain a transferable owner.
  // Multicall distinguishes an absent owner selector from an RPC failure.
  if (contracts.quoterType === "decimal") {
    const code = await getBytecode(client, { address: contracts.quoterAddress!, blockNumber });
    if (!code || code === "0x")
      throw new Error(
        "The catalog quoter has no contract code. Reconcile this pool's pricing implementation.",
      );
    const [owner] = await multicall(client, {
      allowFailure: true,
      blockNumber,
      contracts: [{ address: contracts.quoterAddress!, abi: ownableAbi, functionName: "owner" }],
    });
    if (owner.status === "success")
      throw new Error(
        "The recorded decimal quoter has an owner. Reconcile its pricing type before transferring.",
      );
  } else {
    try {
      if (contracts.quoterType === "relative") {
        await readContract(client, {
          address: contracts.quoterAddress!,
          abi: relativeQuoterPriceIndexAbi,
          functionName: "priceIndex",
          args: [zeroAddress],
          blockNumber,
        });
      } else {
        await readContract(client, {
          address: contracts.quoterAddress!,
          abi: oracleQuoterBaseCurrencyAbi,
          functionName: "baseCurrency",
          blockNumber,
        });
      }
    } catch (cause) {
      throw new Error(
        "Could not verify the recorded pricing implementation. Check the chain connection or ask support to reconcile this pool's quoter type.",
        { cause },
      );
    }
  }
  await Promise.all(
    calls.map(async (call) => {
      const owner = await readContract(client, {
        address: call.to,
        abi: ownableAbi,
        functionName: "owner",
        blockNumber,
      });
      if (owner.toLowerCase() !== input.ownerAddress.toLowerCase())
        throw new Error(
          `Contract ${call.to} has a different owner. Reconcile all pool contract owners before transferring.`,
        );
    }),
  );
  return calls;
}

export function usePoolOwnershipTransfer(pool: UserPool) {
  const client = useClient({ chainId: CHAIN_ID });
  const relay = usePoolAdminRelay(pool);
  return useOwnershipTransfer(
    "pool",
    async (input) => {
      const settled = await relay.mutateAsync({ ...input, deferCatalogRefresh: true });
      if (client)
        await Promise.allSettled(
          poolOwnershipTargets(poolOwnershipContracts(pool)).map((address) =>
            readConfirmedAssetOwner(client, address, {
              txHash: settled.txHash as `0x${string}`,
            }),
          ),
        );
      return settled;
    },
    async (input) => {
      if (!client) throw new Error("The configured chain is unavailable.");
      return preparePoolOwnershipTransfer(client, pool, input);
    },
  );
}
