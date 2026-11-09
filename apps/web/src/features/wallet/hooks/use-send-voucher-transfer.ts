import { type MutationKey, useMutation } from "@tanstack/react-query";
import { useConnection } from "wagmi";

import {
  relayVoucherTransfer,
  type RelayVoucherTransferInput,
} from "#/features/wallet/api/send-voucher-relay";
import { createRelayerClient } from "@clc/api/features/relayer/client";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

/**
 * Every payment Send relays. The mutation cache outlives the view that started
 * one, so a view mounted by a layout switch finds it through this key.
 */
export const SEND_VOUCHER_MUTATION_KEY = ["wallet", "send"] as const;

/** A voucher transfer; another flow that relays one (the MPESA offramp) names its own key. */
export function useSendVoucherTransfer(mutationKey: MutationKey = SEND_VOUCHER_MUTATION_KEY) {
  const { connector } = useConnection();
  return useMutation({
    mutationKey,
    mutationFn: (input: Omit<RelayVoucherTransferInput, "connectorId">) =>
      relayVoucherTransfer({ ...input, connectorId: connector?.id }, relayerClient),
  });
}
