import { useMutation } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import {
  relayVoucherTransfer,
  type RelayVoucherTransferInput,
} from "#/features/wallet/api/send-voucher-relay";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export function useSendVoucherTransfer() {
  const { connector } = useConnection();
  return useMutation({
    mutationFn: (input: Omit<RelayVoucherTransferInput, "connectorId">) =>
      relayVoucherTransfer({ ...input, connectorId: connector?.id }, relayerClient),
  });
}
