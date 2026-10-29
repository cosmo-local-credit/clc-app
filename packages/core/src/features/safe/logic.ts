import {
  concatHex,
  decodeFunctionData,
  encodeFunctionData,
  encodePacked,
  hashTypedData,
  isAddressEqual,
  pad,
  parseAbi,
  size,
  slice,
  toFunctionSelector,
  toHex,
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
export const safeOwnerInfoSchema = z.object({
  kind: z.literal("safe"),
  owner: addressSchema,
  signers: z.array(addressSchema).min(1),
  threshold: z.number().int().min(1).nullable(),
});
export type SafeOwnerInfo = z.infer<typeof safeOwnerInfoSchema>;

export const assetOwnerInfoSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("eoa"), owner: addressSchema }),
  z.object({ kind: z.literal("unsupported"), owner: addressSchema }),
  safeOwnerInfoSchema,
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

/** The reads that identify a Safe and give its signer set, next nonce and version. */
export const safeReadAbi = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function VERSION() view returns (string)",
]);

/**
 * Whether a Safe's `VERSION()` verifies contract (EIP-1271) owner signatures
 * with `isValidSignature(bytes32,bytes)`, the only form a Calibur passkey
 * account implements. Safe 1.5.0 does; 1.3.0 and 1.4.1 call the legacy
 * `isValidSignature(bytes,bytes)`. clc-core applies the same rule.
 */
export function safeSupportsContractSignatures(version: string | undefined): boolean {
  const [major, minor] = (version ?? "").split(".").map((part) => Number.parseInt(part, 10));
  if (major === undefined || minor === undefined || Number.isNaN(major) || Number.isNaN(minor))
    return false;
  return major > 1 || (major === 1 && minor >= 5);
}

/**
 * A contract owner's signature on its own, as clc-core and the Transaction
 * Service take it: `r` the owner, `s` the offset 65 of the data, `v` 0, then
 * the length-prefixed data its `isValidSignature` receives.
 */
export function encodeSafeContractSignature(owner: `0x${string}`, data: Hex): Hex {
  return concatHex([
    pad(owner, { size: 32 }),
    toHex(65n, { size: 32 }),
    "0x00",
    toHex(BigInt(size(data)), { size: 32 }),
    data,
  ]);
}

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

/**
 * The owner management a Safe performs on itself, the only call it may make to
 * itself. Mirrors `checkOwnerChange` in clc-core's `internal/safe`: modules,
 * guards and the fallback handler on the Safe stay unknown.
 */
const safeOwnerAbi = parseAbi([
  "function addOwnerWithThreshold(address owner, uint256 threshold)",
  "function removeOwner(address prevOwner, address owner, uint256 threshold)",
  "function swapOwner(address prevOwner, address oldOwner, address newOwner)",
  "function changeThreshold(uint256 threshold)",
]);

/** Heads a Safe's owner list: valid as a prevOwner, never as an owner. */
const SENTINEL_OWNER = "0x0000000000000000000000000000000000000001";

export type SafeOwnerChange =
  | { kind: "addSigner"; signer: `0x${string}`; threshold: number }
  | { kind: "removeSigner"; signer: `0x${string}`; threshold: number }
  | { kind: "replaceSigner"; oldSigner: `0x${string}`; newSigner: `0x${string}` }
  | { kind: "changeThreshold"; threshold: number };

/**
 * A signer or threshold change the Safe makes on itself, or null for anything
 * clc-core would refuse: another target, calldata that is not exactly the
 * call's arguments, an owner that is the zero address, the sentinel or the
 * Safe, a zero threshold, or a signer replaced by itself. Membership and the
 * threshold's upper bound are the Safe's own checks.
 */
export function safeOwnerChange(call: SafeCall, safe: `0x${string}`): SafeOwnerChange | null {
  if (!isAddressEqual(call.to, safe)) return null;
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: safeOwnerAbi, data: call.data });
  } catch {
    return null;
  }
  // Re-encoding rejects trailing bytes and address words with stray high bits.
  if (
    encodeFunctionData({ abi: safeOwnerAbi, ...decoded }).toLowerCase() !== call.data.toLowerCase()
  )
    return null;
  const owner = (address: `0x${string}`) =>
    !isAddressEqual(address, zeroAddress) &&
    !isAddressEqual(address, SENTINEL_OWNER) &&
    !isAddressEqual(address, safe);
  const threshold = (value: bigint) =>
    value >= 1n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;

  switch (decoded.functionName) {
    case "addOwnerWithThreshold": {
      const [signer, required] = decoded.args;
      const n = threshold(required);
      return owner(signer) && n !== null ? { kind: "addSigner", signer, threshold: n } : null;
    }
    case "removeOwner": {
      const [, signer, required] = decoded.args;
      const n = threshold(required);
      return owner(signer) && n !== null ? { kind: "removeSigner", signer, threshold: n } : null;
    }
    case "swapOwner": {
      const [, oldSigner, newSigner] = decoded.args;
      return owner(oldSigner) && owner(newSigner) && !isAddressEqual(oldSigner, newSigner)
        ? { kind: "replaceSigner", oldSigner, newSigner }
        : null;
    }
    case "changeThreshold": {
      const n = threshold(decoded.args[0]);
      return n !== null ? { kind: "changeThreshold", threshold: n } : null;
    }
  }
}

/** A signer or threshold change a signer proposes for their own Safe. */
export type SafeSignerChangeRequest =
  | { kind: "addSigner"; signer: `0x${string}`; threshold: number }
  | { kind: "removeSigner"; signer: `0x${string}`; threshold: number }
  | { kind: "changeThreshold"; threshold: number };

/** Why a requested change cannot execute against the Safe's current signers. */
export type SafeSignerChangeProblem =
  | "not-a-signer-address"
  | "already-signer"
  | "not-signer"
  | "last-signer"
  | "threshold-out-of-range"
  | "unchanged";

/** The Safe as read from chain just before proposing: owners in `getOwners` order. */
export type SafeSignerState = {
  safe: `0x${string}`;
  owners: readonly `0x${string}`[];
  threshold: number;
};

/**
 * The Safe's own checks on a change, run before anyone signs it: a new signer
 * cannot be the zero address, the sentinel, the Safe or an existing signer;
 * a removed one must be a signer and not the last; and the approvals required
 * must stay between one and the signer count the change leaves.
 */
export function safeSignerChangeProblem(
  state: SafeSignerState,
  change: SafeSignerChangeRequest,
): SafeSignerChangeProblem | null {
  const count = state.owners.length;
  const isOwner = (address: `0x${string}`) =>
    state.owners.some((owner) => isAddressEqual(owner, address));
  const inRange = (threshold: number, max: number) =>
    Number.isInteger(threshold) && threshold >= 1 && threshold <= max;
  switch (change.kind) {
    case "addSigner":
      if (
        ([zeroAddress, SENTINEL_OWNER, state.safe] as const).some((a) =>
          isAddressEqual(a, change.signer),
        )
      )
        return "not-a-signer-address";
      if (isOwner(change.signer)) return "already-signer";
      return inRange(change.threshold, count + 1) ? null : "threshold-out-of-range";
    case "removeSigner":
      if (!isOwner(change.signer)) return "not-signer";
      if (count === 1) return "last-signer";
      return inRange(change.threshold, count - 1) ? null : "threshold-out-of-range";
    case "changeThreshold":
      if (!inRange(change.threshold, count)) return "threshold-out-of-range";
      return change.threshold === state.threshold ? "unchanged" : null;
  }
}

/**
 * The call that makes a change. A removal names the signer's predecessor in
 * the Safe's linked owner list, which `getOwners` returns in order; the first
 * owner follows the sentinel. Throws for a change the Safe would refuse.
 */
export function buildSafeSignerChangeCall(
  state: SafeSignerState,
  change: SafeSignerChangeRequest,
): SafeCall {
  const problem = safeSignerChangeProblem(state, change);
  if (problem) throw new Error(`The signer change cannot execute: ${problem}`);
  const threshold = BigInt(change.threshold);
  let data: Hex;
  switch (change.kind) {
    case "addSigner":
      data = encodeFunctionData({
        abi: safeOwnerAbi,
        functionName: "addOwnerWithThreshold",
        args: [change.signer, threshold],
      });
      break;
    case "removeSigner": {
      const index = state.owners.findIndex((owner) => isAddressEqual(owner, change.signer));
      data = encodeFunctionData({
        abi: safeOwnerAbi,
        functionName: "removeOwner",
        args: [index === 0 ? SENTINEL_OWNER : state.owners[index - 1]!, change.signer, threshold],
      });
      break;
    }
    case "changeThreshold":
      data = encodeFunctionData({
        abi: safeOwnerAbi,
        functionName: "changeThreshold",
        args: [threshold],
      });
      break;
  }
  return { to: state.safe, value: "0", data };
}

/**
 * The name of an allowed owner action, or null for anything else. A call to
 * the Safe itself is named by its owner change; any other by its function.
 */
export function safeCallName(call: SafeCall, safe: `0x${string}`): string | null {
  if (isAddressEqual(call.to, safe)) return safeOwnerChange(call, safe)?.kind ?? null;
  if (size(call.data) < 4) return null;
  return SAFE_CALL_NAMES.get(slice(call.data, 0, 4)) ?? null;
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
 * - `executing`: enough signers confirmed and clc-core is executing it.
 * - `execute`: enough signers confirmed; execution happens in Safe.
 * - `confirmed`: the viewer already signed it.
 * - `confirm`: the viewer may add a confirmation here. Only for calls the app
 *   can decode and clc-core's policy allows, which it re-checks on confirm.
 * - `review`: anything else, reviewed in Safe.
 */
export type SafeProposalAction = "executing" | "execute" | "confirmed" | "confirm" | "review";

export function safeProposalAction(input: {
  safe: `0x${string}`;
  confirmations: readonly { owner: string }[];
  confirmationsRequired: number;
  calls: readonly SafeCall[] | null;
  viewer: `0x${string}` | undefined;
  canSign: boolean;
  /** clc-core has queued or sent the execution itself. */
  executing?: boolean;
}): SafeProposalAction {
  if (input.confirmations.length >= input.confirmationsRequired) {
    return input.executing ? "executing" : "execute";
  }
  const viewer = input.viewer;
  if (viewer && input.confirmations.some((c) => c.owner.toLowerCase() === viewer.toLowerCase())) {
    return "confirmed";
  }
  const allowed =
    input.calls !== null &&
    input.calls.length > 0 &&
    input.calls.every((call) => safeCallName(call, input.safe) !== null);
  return input.canSign && allowed ? "confirm" : "review";
}

const describeAbi = parseAbi([
  "function mintTo(address beneficiary, uint256 amount)",
  "function transferOwnership(address newOwner)",
]);

/** What a confirming signer needs to see in a call: who receives what, or who signs. */
export type SafeCallDetail =
  | { kind: "mint"; token: `0x${string}`; recipient: `0x${string}`; amountRaw: string }
  | { kind: "ownership"; asset: `0x${string}`; newOwner: `0x${string}` }
  | SafeOwnerChange;

export function describeSafeCall(call: SafeCall, safe: `0x${string}`): SafeCallDetail | null {
  if (isAddressEqual(call.to, safe)) return safeOwnerChange(call, safe);
  try {
    const decoded = decodeFunctionData({ abi: describeAbi, data: call.data });
    if (decoded.functionName === "mintTo") {
      const [recipient, amount] = decoded.args;
      return { kind: "mint", token: call.to, recipient, amountRaw: amount.toString() };
    }
    return { kind: "ownership", asset: call.to, newOwner: decoded.args[0] };
  } catch {
    return null;
  }
}
