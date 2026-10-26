import { buildVoucherOwnershipTransferCall } from "@clc/core/features/vouchers/logic";
import { ownableAbi, ownershipRecipientSchema } from "@clc/core/features/pool-admin/logic";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { readContract } from "viem/actions";
import { useClient, useConnection } from "wagmi";
import { useAssetOwnerInfo } from "#/features/ownership/hooks/use-asset-owner-info";
import { useSafeWrite } from "#/features/safe/hooks/use-safe-write";
import { useCaliburDelegation } from "#/features/webauthn/hooks/use-calibur-delegation";
import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { waitForOwnershipRelay } from "#/features/ownership/api/wait-for-ownership-relay";
import { useOwnershipTransfer } from "#/features/ownership/hooks/use-ownership-transfer";
import { CHAIN_ID } from "#/lib/chain";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export type VoucherOwnershipTransferInput = {
  tokenAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  newOwnerAddress: `0x${string}`;
  includeAuthorization?: boolean;
};

/** Existing transport, with settlement and ordered catalog refresh. */
export function useVoucherOwnershipTransfer(asset?: {
  address: string;
  ownerAddress?: string | null;
}) {
  const { address, connector } = useConnection();
  const owner = useAssetOwnerInfo(asset?.address ?? "", asset?.ownerAddress);
  const safeWrite = useSafeWrite();
  const client = useClient({ chainId: CHAIN_ID });
  const delegation = useCaliburDelegation(address);
  const mutation = useOwnershipTransfer(
    "voucher",
    async (input) => {
      let trackingId = input.trackingId;
      if (!trackingId && asset && owner.info?.kind === "safe" && owner.isSafeSigner) {
        return safeWrite.write({
          safe: owner.info.owner,
          calls: input.calls,
        });
      }
      if (!trackingId) {
        if (!address || delegation === "checking")
          throw new Error("Still checking your wallet. Try again in a moment.");
        const submitted = await relayCaliburBatch(
          {
            senderAddress: address,
            connectorId: connector?.id,
            calls: input.calls,
            includeAuthorization: delegation === "not-delegated",
          },
          relayerClient,
        );
        trackingId = submitted.trackingId;
        input.onSubmitted(trackingId);
      }
      const settled = await waitForOwnershipRelay(relayerClient, trackingId);
      input.onConfirmed(trackingId, settled.txHash);
      return settled;
    },
    async (input) => {
      ownershipRecipientSchema(input.ownerAddress, [input.assetAddress]).parse(
        input.newOwnerAddress,
      );
      if (!client) throw new Error("The configured chain is unavailable.");
      const owner = await readContract(client, {
        address: input.assetAddress,
        abi: ownableAbi,
        functionName: "owner",
      });
      if (owner.toLowerCase() !== input.ownerAddress.toLowerCase())
        throw new Error("The voucher's on-chain owner has changed. Refresh before transferring.");
      return [
        buildVoucherOwnershipTransferCall({
          tokenAddress: input.assetAddress,
          newOwnerAddress: input.newOwnerAddress,
        }),
      ];
    },
    owner.isSafeSigner,
  );
  return {
    ...mutation,
    mutateAsync: (input: VoucherOwnershipTransferInput) =>
      mutation.mutateAsync({ ...input, assetAddress: input.tokenAddress }),
  };
}
