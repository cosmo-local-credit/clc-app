import { buildVoucherOwnershipTransferCall } from "@clc/core/features/vouchers/logic";
import { useMutation } from "@tanstack/react-query";

import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export type VoucherOwnershipTransferInput = {
  tokenAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  newOwnerAddress: `0x${string}`;
  includeAuthorization?: boolean;
};

/** Signs the current owner's ownership handoff and has Calibur relay it. */
export function useVoucherOwnershipTransfer() {
  return useMutation({
    mutationFn: (input: VoucherOwnershipTransferInput) =>
      relayCaliburBatch(
        {
          senderAddress: input.ownerAddress,
          calls: [buildVoucherOwnershipTransferCall(input)],
          includeAuthorization: input.includeAuthorization,
        },
        relayerClient,
      ),
  });
}
