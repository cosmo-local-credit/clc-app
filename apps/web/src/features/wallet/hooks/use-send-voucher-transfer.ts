import { useMutation } from "@tanstack/react-query";

import {
  relayVoucherTransfer,
  type RelayVoucherTransferInput,
} from "#/features/wallet/api/send-voucher-relay";
import { createRelayerClient } from "#/features/webauthn/api/relayer-client";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export function useSendVoucherTransfer() {
  return useMutation({
    mutationFn: (input: RelayVoucherTransferInput) => relayVoucherTransfer(input, relayerClient),
  });
}
