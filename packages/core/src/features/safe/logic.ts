import {
  concatHex,
  decodeFunctionData,
  encodeFunctionData,
  encodePacked,
  hashTypedData,
  isAddressEqual,
  parseAbi,
  size,
  slice,
  toFunctionSelector,
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

/** Persisted ownership capabilities. A custom multisig may omit a threshold getter. */
export const assetOwnerInfoSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("eoa"), owner: addressSchema }),
  z.object({ kind: z.literal("unsupported"), owner: addressSchema }),
  z.object({
    kind: z.literal("safe"),
    owner: addressSchema,
    signers: z.array(addressSchema).min(1),
    threshold: z.number().int().min(1).nullable(),
  }),
]);
export type AssetOwnerInfo = z.infer<typeof assetOwnerInfoSchema>;

const SAFE_OPERATION_CALL = 0;
const SAFE_OPERATION_DELEGATE_CALL = 1;

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

const safeCallSchema = z.object({
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

const safeAbi = parseAbi(["function multiSend(bytes transactions)"]);

/** The reads that identify a Safe and give its signer set and next nonce. */
export const safeReadAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
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

/** The queue in the hosted Safe app, a fallback place to sign and execute. */
export function safeAppQueueUrl(appPrefix: string, safeAddress: `0x${string}`): string {
  return `https://app.safe.global/transactions/queue?safe=${appPrefix}:${safeAddress}`;
}

export function isSigner(signers: readonly `0x${string}`[], account: `0x${string}` | undefined) {
  return account !== undefined && signers.some((signer) => isAddressEqual(signer, account));
}

/** EIP-7702 delegation designator: `0xef0100` followed by the 20-byte target. */
const DELEGATION_PREFIX = "0xef0100";

/**
 * The first branch of owner-kind resolution, from `eth_getCode` alone. Empty
 * code and an EIP-7702 delegation (a Calibur-delegated EOA) are both `eoa`.
 * Other contract code needs a valid `getOwners()` probe; threshold information
 * is optional.
 */
export function classifyOwnerCode(code: Hex | undefined): "eoa" | "contract" {
  if (code === undefined || code === "0x") return "eoa";
  if (code.toLowerCase().startsWith(DELEGATION_PREFIX) && size(code) === 23) return "eoa";
  return "contract";
}

/**
 * Owner actions clc-core's relay policy allows. Mirrors
 * `DefaultAllowedSignatures` in clc-core's `internal/safe`: a call outside this
 * list is rejected at execution, so the app shows it as unknown rather than
 * offering to sign it.
 */
const SAFE_CALL_SIGNATURES = [
  "transferOwnership(address)",
  "add(address)",
  "remove(address)",
  "mintTo(address,uint256)",
  "setLimitFor(address,address,uint256)",
  "setPriceIndexValue(address,uint256)",
  "setOracle(address,address)",
  "setDefaultFee(uint256)",
  "setFeeAddress(address)",
  "setQuoter(address)",
  "withdraw(address)",
  "withdraw(address,uint256)",
  "withdrawLiquidity(address,address,uint256)",
] as const;

const SAFE_CALL_NAMES = new Map<string, string>(
  SAFE_CALL_SIGNATURES.map((signature) => [
    toFunctionSelector(signature),
    signature.slice(0, signature.indexOf("(")),
  ]),
);

/** The function name of an allowed owner action, or null for anything else. */
export function safeCallName(data: Hex): string | null {
  if (size(data) < 4) return null;
  return SAFE_CALL_NAMES.get(slice(data, 0, 4)) ?? null;
}

/**
 * The calls a Safe transaction performs: the transaction itself, or each
 * subcall when it delegatecalls the pinned MultiSendCallOnly. Returns null for
 * a payload that does not parse, which the app shows as undecodable.
 */
export function decodeSafeTransactionCalls(
  tx: Pick<SafeTransaction, "to" | "value" | "data" | "operation">,
  multiSendCallOnly: readonly `0x${string}`[],
): SafeCall[] | null {
  if (tx.operation === SAFE_OPERATION_CALL) {
    return [{ to: tx.to, value: tx.value, data: tx.data }];
  }
  if (!multiSendCallOnly.some((address) => isAddressEqual(address, tx.to))) return null;
  try {
    const { args } = decodeFunctionData({ abi: safeAbi, data: tx.data });
    const packed = args?.[0];
    if (typeof packed !== "string") return null;
    const calls: SafeCall[] = [];
    let offset = 0;
    const total = size(packed as Hex);
    while (offset < total) {
      if (total - offset < 85) return null;
      const to = slice(packed as Hex, offset + 1, offset + 21);
      const value = BigInt(slice(packed as Hex, offset + 21, offset + 53));
      const length = Number(BigInt(slice(packed as Hex, offset + 53, offset + 85)));
      if (offset + 85 + length > total) return null;
      calls.push({
        to: to as `0x${string}`,
        value: value.toString(),
        data: slice(packed as Hex, offset + 85, offset + 85 + length),
      });
      offset += 85 + length;
    }
    return calls.length > 0 ? calls : null;
  } catch {
    return null;
  }
}

/**
 * What a signer can do with a queued proposal from the app.
 *
 * - `execute`: enough signers confirmed; execution happens in Safe.
 * - `confirmed`: the viewer already signed it.
 * - `confirm`: the viewer may add a confirmation here. Only for calls the app
 *   can decode and clc-core's policy allows, which it re-checks on confirm.
 * - `review`: anything else, reviewed in Safe.
 */
export type SafeProposalAction = "execute" | "confirmed" | "confirm" | "review";

export function safeProposalAction(input: {
  confirmations: readonly { owner: string }[];
  confirmationsRequired: number;
  calls: readonly SafeCall[] | null;
  viewer: `0x${string}` | undefined;
  canSign: boolean;
}): SafeProposalAction {
  if (input.confirmations.length >= input.confirmationsRequired) return "execute";
  const viewer = input.viewer;
  if (viewer && input.confirmations.some((c) => c.owner.toLowerCase() === viewer.toLowerCase())) {
    return "confirmed";
  }
  const allowed =
    input.calls !== null &&
    input.calls.length > 0 &&
    input.calls.every((call) => safeCallName(call.data) !== null);
  return input.canSign && allowed ? "confirm" : "review";
}
