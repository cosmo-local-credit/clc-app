import {
  buildCollectPoolFeesCalls,
  buildPoolDepositCalls,
  buildPoolRouteCalls,
  type PoolRouteHop,
} from "@clc/core/features/pool-swaps/logic";
import {
  relayCaliburBatch,
  type RelayCaliburBatchResult,
} from "#/features/webauthn/api/relay-calibur-batch";
import type { RelayerClient } from "#/features/webauthn/api/relayer-client";

type RelayPoolBatchOptions = {
  senderAddress: `0x${string}`;
  includeAuthorization?: boolean;
  deadline?: string;
};

export type RelayPoolDepositInput = RelayPoolBatchOptions & {
  poolAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  amountRaw: string;
};

export type RelayPoolSwapExactInputInput = RelayPoolBatchOptions & {
  path: PoolRouteHop[];
  amountInRaw?: string;
  hopAmountIns?: string[];
  recipientAddress?: `0x${string}`;
};

export type RelayPoolSwapExactOutputInput = RelayPoolBatchOptions & {
  path: PoolRouteHop[];
  hopAmountIns: string[];
  recipientAddress?: `0x${string}`;
};

type RelayCollectPoolFeesInput = RelayPoolBatchOptions & {
  poolAddress: `0x${string}`;
  tokenOut: `0x${string}`;
  amountRaw?: string;
};

export async function relayPoolDeposit(
  input: RelayPoolDepositInput,
  client: RelayerClient,
): Promise<RelayCaliburBatchResult> {
  const calls = buildPoolDepositCalls({
    poolAddress: input.poolAddress,
    tokenAddress: input.tokenAddress,
    amountRaw: input.amountRaw,
  });
  return relayPoolCalls(input, calls, client);
}

export async function relayPoolSwapExactInput(
  input: RelayPoolSwapExactInputInput,
  client: RelayerClient,
): Promise<RelayCaliburBatchResult> {
  let hopAmountIns = input.hopAmountIns;
  if (!hopAmountIns) {
    if (input.path.length !== 1 || !input.amountInRaw) {
      throw new Error("Exact-input pool route relay requires hopAmountIns for multi-hop routes.");
    }
    hopAmountIns = [input.amountInRaw];
  }

  const calls = buildPoolRouteCalls({
    path: input.path,
    hopAmountIns,
    recipientAddress: input.recipientAddress,
  });
  return relayPoolCalls(input, calls, client);
}

export async function relayPoolSwapExactOutput(
  input: RelayPoolSwapExactOutputInput,
  client: RelayerClient,
): Promise<RelayCaliburBatchResult> {
  const calls = buildPoolRouteCalls({
    path: input.path,
    hopAmountIns: input.hopAmountIns,
    recipientAddress: input.recipientAddress,
  });
  return relayPoolCalls(input, calls, client);
}

export async function relayCollectPoolFees(
  input: RelayCollectPoolFeesInput,
  client: RelayerClient,
): Promise<RelayCaliburBatchResult> {
  const calls = buildCollectPoolFeesCalls({
    poolAddress: input.poolAddress,
    tokenOut: input.tokenOut,
    amountRaw: input.amountRaw,
  });
  return relayPoolCalls(input, calls, client);
}

function relayPoolCalls(
  input: RelayPoolBatchOptions,
  calls: Parameters<typeof relayCaliburBatch>[0]["calls"],
  client: RelayerClient,
): Promise<RelayCaliburBatchResult> {
  return relayCaliburBatch(
    {
      senderAddress: input.senderAddress,
      calls,
      includeAuthorization: input.includeAuthorization,
      deadline: input.deadline,
    },
    client,
  );
}
