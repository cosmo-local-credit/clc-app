import { createRelayerClient } from "@clc/api/features/relayer/client";
import { erc20BalanceOfAbi } from "@clc/core/features/pool-swaps/logic";
import { buildVoucherBurnCall } from "@clc/core/features/vouchers/logic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { readContract } from "viem/actions";
import { useClient, useConnection } from "wagmi";

import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import { RELAYER_URL } from "#/lib/relayer-config";

const relayerClient = createRelayerClient(RELAYER_URL);

export type VoucherBurnInput = {
  tokenAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  amountRaw: string;
  includeAuthorization?: boolean;
};

export const voucherOwnerBalanceQueryKeys = {
  all: ["voucher-owner-balance"] as const,
  balance: (tokenAddress: string, ownerAddress: string) =>
    ["voucher-owner-balance", tokenAddress.toLowerCase(), ownerAddress.toLowerCase()] as const,
};

/**
 * What the owner can destroy. Read from the chain rather than the indexer,
 * which trails a fresh mint, because `burn` reverts on a stale figure.
 */
export function useVoucherOwnerBalance(
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  enabled: boolean,
) {
  const client = useClient();
  return useQuery({
    queryKey: voucherOwnerBalanceQueryKeys.balance(tokenAddress, ownerAddress),
    queryFn: async () => {
      if (!client) throw new Error("The voucher balance read is missing a client.");
      const balance = await readContract(client, {
        address: tokenAddress,
        abi: erc20BalanceOfAbi,
        functionName: "balanceOf",
        args: [ownerAddress],
      });
      return balance.toString();
    },
    enabled: enabled && !!client,
  });
}

/**
 * Burns from the owner's own balance. clc-core's Safe policy does not allow
 * `burn`, so a multisig owner is never offered this and the call is always
 * relayed for the owner's own wallet.
 */
export function useVoucherBurn() {
  const { connector } = useConnection();
  return useMutation({
    mutationFn: (input: VoucherBurnInput) =>
      relayCaliburBatch(
        {
          senderAddress: input.ownerAddress,
          connectorId: connector?.id,
          calls: [buildVoucherBurnCall(input)],
          includeAuthorization: input.includeAuthorization,
        },
        relayerClient,
      ),
  });
}
