import { type CaliburCall } from "@clc/core/features/webauthn/index";
import { encodeFunctionData, erc20Abi } from "viem";

import { relayCaliburBatch } from "#/features/webauthn/api/relay-calibur-batch";
import type { RelayerClient, RelaySharePayload } from "#/features/webauthn/api/relayer-client";

export type BuildVoucherTransferCallInput = {
  tokenAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  amountRaw: string;
};

export type RelayVoucherTransferInput = BuildVoucherTransferCallInput & {
  senderAddress: `0x${string}`;
  includeAuthorization?: boolean;
  share?: RelaySharePayload;
};

export type RelayVoucherTransferResult = {
  trackingId: string;
  signatureType: "secp256k1" | "webauthn";
};

export function buildVoucherTransferCall(input: BuildVoucherTransferCallInput): CaliburCall {
  const amount = BigInt(input.amountRaw);
  return {
    to: input.tokenAddress,
    value: "0",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [input.recipientAddress, amount],
    }),
  };
}

export async function relayVoucherTransfer(
  input: RelayVoucherTransferInput,
  client: RelayerClient,
): Promise<RelayVoucherTransferResult> {
  const call = buildVoucherTransferCall(input);
  return relayCaliburBatch(
    {
      senderAddress: input.senderAddress,
      calls: [call],
      includeAuthorization: input.includeAuthorization,
      share: input.share,
    },
    client,
  );
}
