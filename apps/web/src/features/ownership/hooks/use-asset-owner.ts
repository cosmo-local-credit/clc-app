import { ownableAbi } from "@clc/core/features/pool-admin/logic";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Client } from "viem";
import { getBlockNumber, getTransactionReceipt, readContract } from "viem/actions";
import { useClient } from "wagmi";
import { CHAIN_ID } from "#/lib/chain";
import {
  ownershipKey,
  useOwnershipSubmissions,
  type OwnershipSubmission,
} from "../state/ownership-submissions";

/** Refuse lagging RPC heads: an old latest read cannot undo confirmed authority. */
export async function readConfirmedAssetOwner(
  client: Client,
  address: `0x${string}`,
  submission: Pick<OwnershipSubmission, "txHash">,
) {
  if (!submission.txHash) throw new Error("Confirmed ownership is awaiting a transaction receipt.");
  const receipt = await getTransactionReceipt(client, { hash: submission.txHash });
  const blockNumber = await getBlockNumber(client, { cacheTime: 0 });
  if (blockNumber < receipt.blockNumber)
    throw new Error("The RPC head has not reached the confirmed transfer.");
  return readContract(client, { address, abi: ownableAbi, functionName: "owner", blockNumber });
}

export const assetOwnerKey = (address: string) =>
  ["asset-owner", CHAIN_ID, address.toLowerCase()] as const;

/** A confirmed handover takes away controls immediately, even during catalog lag. */
export function useAssetOwner(address: string, catalogOwner: string | null | undefined) {
  const client = useClient({ chainId: CHAIN_ID });
  const submission = useOwnershipSubmissions((state) => state.submissions[ownershipKey(address)]);
  const owner = useQuery({
    queryKey: assetOwnerKey(address),
    queryFn: () => {
      if (!client || !isAddress(address)) throw new Error("Ownership read is unavailable.");
      if (!submission?.confirmed) throw new Error("There is no confirmed transfer to refresh.");
      return readConfirmedAssetOwner(client, address, submission);
    },
    // Reads are needed after a local handover, including across reloads. Other
    // visitors keep using catalog authority; submission always rechecks chain.
    enabled: !!client && isAddress(address) && !!submission?.confirmed,
    staleTime: 0,
    retry: false,
  });
  return submission?.confirmed ? (owner.data ?? submission.newOwnerAddress) : catalogOwner;
}
