import { type CaliburCall } from "@clc/core/features/webauthn/index";
import { encodeFunctionData, erc20Abi } from "viem";

import {
  relayCaliburBatch,
  type RelayCaliburBatchResult,
} from "#/features/webauthn/api/relay-calibur-batch";
import type { RelayerClient } from "@clc/api/features/relayer/client";

export type BuildVoucherTransferCallInput = {
  tokenAddress: `0x${string}`;
  recipientAddress: `0x${string}`;
  amountRaw: string;
};

export type RelayVoucherTransferInput = BuildVoucherTransferCallInput & {
  senderAddress: `0x${string}`;
  connectorId: string | undefined;
  includeAuthorization?: boolean;
};

export type RelayVoucherTransferResult = RelayCaliburBatchResult;

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
      connectorId: input.connectorId,
      calls: [call],
      includeAuthorization: input.includeAuthorization,
    },
    client,
  );
}
