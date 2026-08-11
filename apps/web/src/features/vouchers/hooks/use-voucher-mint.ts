import { buildVoucherMintCall } from "@clc/core/features/vouchers/logic";
import { useMutation } from "@tanstack/react-query";

import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export type VoucherMintInput = {
  tokenAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  amountRaw: string;
  includeAuthorization?: boolean;
};

export function useVoucherMint() {
  return useMutation({
    mutationFn: (input: VoucherMintInput) =>
      relayCaliburBatch(
        {
          senderAddress: input.ownerAddress,
          calls: [buildVoucherMintCall(input)],
          includeAuthorization: input.includeAuthorization,
        },
        relayerClient,
      ),
  });
}
