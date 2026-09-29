import { buildVoucherMintCall } from "@clc/core/features/vouchers/logic";
import { useMutation } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export type VoucherMintInput = {
  tokenAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  amountRaw: string;
  includeAuthorization?: boolean;
};

export function useVoucherMint() {
  const { connector } = useConnection();
  return useMutation({
    mutationFn: (input: VoucherMintInput) =>
      relayCaliburBatch(
        {
          senderAddress: input.ownerAddress,
          connectorId: connector?.id,
          calls: [buildVoucherMintCall(input)],
          includeAuthorization: input.includeAuthorization,
        },
        relayerClient,
      ),
  });
}
