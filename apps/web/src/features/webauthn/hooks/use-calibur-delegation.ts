import { isEip7702Delegated } from "@clc/core/features/webauthn";
import { useBytecode } from "wagmi";

import { CALIBUR_ADDRESS } from "#/lib/relayer-config";

export type CaliburDelegationStatus = "checking" | "delegated" | "not-delegated";

/**
 * Reads the EOA's on-chain bytecode via wagmi's `useBytecode` and reports
 * whether the wallet is currently delegated to the Calibur smart account
 * under EIP-7702 (account code = `0xef0100 ++ caliburAddress`).
 *
 * Returns `"checking"` while there is no address or the bytecode read is still
 * pending, `"delegated"` once the live code matches Calibur, otherwise
 * `"not-delegated"`.
 */
export function useCaliburDelegation(address: `0x${string}` | undefined): CaliburDelegationStatus {
  const { data, isPending } = useBytecode({
    address,
    query: { enabled: Boolean(address) },
  });

  if (!address || isPending) return "checking";
  return isEip7702Delegated(data, CALIBUR_ADDRESS) ? "delegated" : "not-delegated";
}
