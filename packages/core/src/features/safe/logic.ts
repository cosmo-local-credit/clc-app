import {
  concatHex,
  encodeFunctionData,
  encodePacked,
  hashTypedData,
  isAddressEqual,
  parseAbi,
  size,
  zeroAddress,
  type Hex,
} from "viem";
import { z } from "zod";

const addressSchema = z.custom<`0x${string}`>(
  (value) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value),
  "Invalid address",
);
const hexSchema = z.custom<Hex>(
  (value) => typeof value === "string" && /^0x([0-9a-fA-F]{2})*$/.test(value),
  "Invalid hex",
);
const decimalSchema = z.string().regex(/^\d+$/);

/** `eoa` includes an EIP-7702 delegated account; only other contract code can be a Safe. */
export const ownerKindSchema = z.enum(["eoa", "safe", "unsupported"]);
export type OwnerKind = z.infer<typeof ownerKindSchema>;

/**
 * `pending` needs confirmations, `ready` has threshold and can be executed,
 * `executed` consumed its nonce with our effect, `failed` consumed the nonce
 * without it, `replaced` lost its nonce to a different transaction. A revert
 * leaves the nonce unused and is not `failed`: Execute is offered again.
 */
export const safeStatusSchema = z.enum(["pending", "ready", "executed", "failed", "replaced"]);
export type SafeStatus = z.infer<typeof safeStatusSchema>;

export const SAFE_OPERATION_CALL = 0;
export const SAFE_OPERATION_DELEGATE_CALL = 1;

export const safeTransactionSchema = z.object({
  to: addressSchema,
  value: decimalSchema,
  data: hexSchema,
  operation: z.union([z.literal(0), z.literal(1)]),
  safeTxGas: decimalSchema,
  baseGas: decimalSchema,
  gasPrice: decimalSchema,
  gasToken: addressSchema,
  refundReceiver: addressSchema,
  nonce: decimalSchema,
});
export type SafeTransaction = z.infer<typeof safeTransactionSchema>;

export const safeConfirmationSchema = z.object({
  owner: addressSchema,
  signature: hexSchema,
});
export type SafeConfirmation = z.infer<typeof safeConfirmationSchema>;

export const safeCallSchema = z.object({
  to: addressSchema,
  value: decimalSchema,
  data: hexSchema,
});
export type SafeCall = z.infer<typeof safeCallSchema>;

const safeTxTypes = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

const safeAbi = parseAbi([
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool success)",
  "function multiSend(bytes transactions)",
]);

/** Gas parameters clc-core requires: an inner failure reverts and nothing is refunded to the relayer. */
const ZERO_GAS = {
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: zeroAddress,
  refundReceiver: zeroAddress,
} as const;

export function safeTypedData(chainId: number, safeAddress: `0x${string}`, tx: SafeTransaction) {
  return {
    domain: { chainId, verifyingContract: safeAddress },
    types: safeTxTypes,
    primaryType: "SafeTx",
    message: {
      to: tx.to,
      value: BigInt(tx.value),
      data: tx.data,
      operation: tx.operation,
      safeTxGas: BigInt(tx.safeTxGas),
      baseGas: BigInt(tx.baseGas),
      gasPrice: BigInt(tx.gasPrice),
      gasToken: tx.gasToken,
      refundReceiver: tx.refundReceiver,
      nonce: BigInt(tx.nonce),
    },
  } as const;
}

/** The EIP-712 digest owners sign and that `approveHash` / the Transaction Service key on. */
export function computeSafeTxHash(
  chainId: number,
  safeAddress: `0x${string}`,
  tx: SafeTransaction,
): Hex {
  return hashTypedData(safeTypedData(chainId, safeAddress, tx));
}

/**
 * MultiSendCallOnly payload: each call packed as
 * `operation(1) | to(20) | value(32) | dataLength(32) | data`, wrapped in
 * `multiSend(bytes)`. Every subcall is operation 0; the Safe delegatecalls the
 * wrapper itself.
 */
export function encodeMultiSend(calls: readonly SafeCall[]): Hex {
  if (calls.length === 0) throw new Error("multiSend needs at least one call");
  const packed = concatHex(
    calls.map((call) =>
      encodePacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [0, call.to, BigInt(call.value), BigInt(size(call.data)), call.data],
      ),
    ),
  );
  return encodeFunctionData({ abi: safeAbi, functionName: "multiSend", args: [packed] });
}

/**
 * A single call is `operation = 0` straight at its target; a batch goes through
 * the pinned MultiSendCallOnly as `operation = 1`.
 */
export function buildSafeTransaction(input: {
  calls: readonly SafeCall[];
  nonce: string;
  multiSendCallOnly: `0x${string}`;
}): SafeTransaction {
  const [only] = input.calls;
  if (!only) throw new Error("A Safe transaction needs at least one call");
  if (input.calls.length === 1) {
    return { ...only, operation: SAFE_OPERATION_CALL, nonce: input.nonce, ...ZERO_GAS };
  }
  return {
    to: input.multiSendCallOnly,
    value: "0",
    data: encodeMultiSend(input.calls),
    operation: SAFE_OPERATION_DELEGATE_CALL,
    nonce: input.nonce,
    ...ZERO_GAS,
  };
}

/** A zero-value self-call at the same nonce; executing it voids the original. */
export function buildCancellationTransaction(
  safeAddress: `0x${string}`,
  nonce: string,
): SafeTransaction {
  return {
    to: safeAddress,
    value: "0",
    data: "0x",
    operation: SAFE_OPERATION_CALL,
    nonce,
    ...ZERO_GAS,
  };
}

/**
 * Concatenates ECDSA confirmations in the order the Safe verifies them:
 * signer address ascending, compared as a number. Each signature must be the
 * 65-byte `r | s | v` form with v of 27 or 28; contract and approved-hash
 * signatures are not produced by this app.
 */
export function packSignatures(confirmations: readonly SafeConfirmation[]): Hex {
  const seen = new Set<string>();
  for (const { owner, signature } of confirmations) {
    if (size(signature) !== 65) throw new Error("Safe signatures must be 65 bytes");
    const v = Number.parseInt(signature.slice(-2), 16);
    if (v !== 27 && v !== 28) throw new Error("Safe signature v must be 27 or 28");
    if (seen.has(owner.toLowerCase())) throw new Error("Duplicate Safe signer");
    seen.add(owner.toLowerCase());
  }
  const sorted = [...confirmations].sort((a, b) => {
    const left = BigInt(a.owner);
    const right = BigInt(b.owner);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return concatHex(sorted.map((confirmation) => confirmation.signature));
}

export function encodeExecTransaction(tx: SafeTransaction, packedSignatures: Hex): Hex {
  return encodeFunctionData({
    abi: safeAbi,
    functionName: "execTransaction",
    args: [
      tx.to,
      BigInt(tx.value),
      tx.data,
      tx.operation,
      BigInt(tx.safeTxGas),
      BigInt(tx.baseGas),
      BigInt(tx.gasPrice),
      tx.gasToken,
      tx.refundReceiver,
      packedSignatures,
    ],
  });
}

/**
 * The single Calibur call that executes a Safe transaction: from the executing
 * signer's account to the Safe, zero value. The Safe is `msg.sender` to the asset.
 */
export function buildExecuteSafeCall(
  safeAddress: `0x${string}`,
  tx: SafeTransaction,
  confirmations: readonly SafeConfirmation[],
): SafeCall {
  return {
    to: safeAddress,
    value: "0",
    data: encodeExecTransaction(tx, packSignatures(confirmations)),
  };
}

export type SafeStatusInput = {
  confirmations: number;
  threshold: number;
  /** The Safe's current on-chain nonce. */
  safeNonce: bigint;
  txNonce: bigint;
  /** Whether this exact safeTxHash was executed on chain. */
  executed: boolean;
  /** Whether the executed transaction succeeded. */
  executedSuccessfully?: boolean;
};

/**
 * Status from chain facts. A consumed nonce without our transaction is
 * `replaced`, never `failed`; `failed` means our own execution landed and its
 * inner call did not take effect. A revert leaves the nonce unused, so it never
 * reaches here as anything but `pending` or `ready`.
 */
export function deriveSafeStatus(input: SafeStatusInput): SafeStatus {
  if (input.executed) return input.executedSuccessfully === false ? "failed" : "executed";
  if (input.safeNonce > input.txNonce) return "replaced";
  return input.confirmations >= input.threshold ? "ready" : "pending";
}

/** `ready` once threshold is met; threshold 1 collapses sign and execute into one step. */
export function collapsesToSingleStep(threshold: number): boolean {
  return threshold === 1;
}

export function isSigner(signers: readonly `0x${string}`[], account: `0x${string}` | undefined) {
  return account !== undefined && signers.some((signer) => isAddressEqual(signer, account));
}

/** EIP-7702 delegation designator: `0xef0100` followed by the 20-byte target. */
const DELEGATION_PREFIX = "0xef0100";

/**
 * The first branch of owner-kind resolution, from `eth_getCode` alone. Empty
 * code and an EIP-7702 delegation (a Calibur-delegated EOA) are both `eoa`.
 * Other contract code needs the `VERSION()` / `getOwners` / `getThreshold`
 * probe, which the caller runs.
 */
export function classifyOwnerCode(code: Hex | undefined): "eoa" | "contract" {
  if (code === undefined || code === "0x") return "eoa";
  if (code.toLowerCase().startsWith(DELEGATION_PREFIX) && size(code) === 23) return "eoa";
  return "contract";
}

export const SUPPORTED_SAFE_VERSIONS = ["1.3.0", "1.4.1"] as const;

export function isSupportedSafeVersion(version: string): boolean {
  return (SUPPORTED_SAFE_VERSIONS as readonly string[]).includes(version);
}
