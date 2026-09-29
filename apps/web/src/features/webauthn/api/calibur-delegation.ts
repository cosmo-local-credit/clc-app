import { isEip7702Delegated } from "@clc/core/features/webauthn/index";
import { getCode } from "viem/actions";
import { getClient } from "wagmi/actions";

import { CHAIN_ID } from "#/lib/chain";
import { CALIBUR_ADDRESS } from "#/lib/relayer-config";
import { wagmiConfig } from "#/providers/web3-config";

/**
 * Whether `address` currently delegates to Calibur under EIP-7702.
 *
 * The imperative twin of `useCaliburDelegation`, for code that must decide
 * before it signs: an already-delegated wallet gets no EIP-7702 authorization,
 * so none is requested or signed. A failed read rejects rather than guessing —
 * guessing "delegated" would relay a first registration the chain cannot run.
 */
export async function readCaliburDelegation(address: `0x${string}`): Promise<boolean> {
  const client = getClient(wagmiConfig, { chainId: CHAIN_ID });
  if (!client) throw new Error("No RPC client is configured for this chain.");
  const code = await getCode(client, { address });
  return isEip7702Delegated(code, CALIBUR_ADDRESS);
}
