/**
 * Replacing a compromised sign-in card (GH #412).
 *
 * A card's key is the root key of an EOA delegated to Calibur, and Calibur
 * cannot revoke a root key. So a replacement moves the account to a new
 * address: clc-core re-points the account (POST /auth/key-rotation), and the
 * client moves what the old wallet owns alone — pools, vouchers, balances — in
 * Calibur batches the old key signs. Assets a Safe owns are never touched.
 */

import { encodeFunctionData, getAddress, isAddressEqual, parseAbi } from "viem";

import { POOL_SEAL_FEE_ADDRESS, swapPoolSetFeeAddressAbi } from "../pool-admin/logic";
import type { CaliburCall } from "../webauthn/index";

/**
 * GiftableToken's expiry check. It is not a view: it latches `expired` on the
 * first call past the expiry date, and every transfer runs it, so an expired
 * voucher's balance cannot move. Simulate it to ask without changing anything.
 */
export const giftableTokenApplyExpiryAbi = parseAbi(["function applyExpiry() returns (uint8)"]);

/** clc-core's relayer refuses a batch with more calls (pkg/api/api.go). */
export const MAX_CALIBUR_BATCH_CALLS = 16;

const KEY_ROTATION_STATEMENT_PREFIX = "Replace sign-in card ";

/**
 * The SIWE statement both cards sign. clc-core accepts a rotation only when
 * both proofs carry exactly this text (util.KeyRotationStatement), so a
 * signature made to sign in can never move an account.
 */
export function buildKeyRotationStatement(oldAddress: string, newAddress: string): string {
  return `${KEY_ROTATION_STATEMENT_PREFIX}${getAddress(oldAddress)} with ${getAddress(newAddress)}`;
}

export type RotationAssetKind = "pool" | "voucher" | "balance" | "native";

/** One asset's calls. A group is never split across batches. */
export type RotationGroup = {
  kind: RotationAssetKind;
  address: `0x${string}`;
  calls: CaliburCall[];
};

export type RotationBatch<G extends RotationGroup = RotationGroup> = {
  groups: G[];
  calls: CaliburCall[];
};

const KIND_ORDER: Record<RotationAssetKind, number> = {
  pool: 0,
  voucher: 1,
  balance: 2,
  native: 3,
};

function movesOwnership(kind: RotationAssetKind): boolean {
  return kind === "pool" || kind === "voucher";
}

/**
 * Packs groups into relayable batches.
 *
 * Ownership moves first and never shares a batch with a transfer: every batch
 * reverts as a whole, and whoever holds the old key can drain a balance between
 * planning and execution, which must not take a pool handover down with it.
 * Within that order groups are packed first-fit without reordering.
 */
export function planKeyRotationBatches<G extends RotationGroup>(
  groups: readonly G[],
): RotationBatch<G>[] {
  const ordered = groups
    .filter((group) => group.calls.length > 0)
    .map((group, index) => ({ group, index }))
    .sort((a, b) => KIND_ORDER[a.group.kind] - KIND_ORDER[b.group.kind] || a.index - b.index)
    .map(({ group }) => group);

  const batches: RotationBatch<G>[] = [];
  let current: RotationBatch<G> | null = null;
  let currentMovesOwnership = false;
  for (const group of ordered) {
    if (group.calls.length > MAX_CALIBUR_BATCH_CALLS) {
      throw new Error(`Moving ${group.address} needs more calls than one transaction can carry.`);
    }
    if (
      current === null ||
      (currentMovesOwnership && !movesOwnership(group.kind)) ||
      current.calls.length + group.calls.length > MAX_CALIBUR_BATCH_CALLS
    ) {
      current = { groups: [], calls: [] };
      currentMovesOwnership = movesOwnership(group.kind);
      batches.push(current);
    }
    current.groups.push(group);
    current.calls.push(...group.calls);
  }
  return batches;
}

export type PoolFeeAddressOutcome = "moved" | "sealed" | "unchanged";

/**
 * A pool's handover plus its fee recipient. The existing handover leaves the
 * fee address alone, but a creator's pool usually pays fees to the creator, and
 * that address is now the compromised card. `setFeeAddress` is onlyOwner, so it
 * runs before SwapPool's `transferOwnership`; a sealed fee address cannot move
 * and is reported instead.
 */
export function poolRotationCalls(input: {
  from: `0x${string}`;
  to: `0x${string}`;
  poolAddress: `0x${string}`;
  feeAddress: `0x${string}`;
  sealState: number;
  handoverCalls: CaliburCall[];
}): { calls: CaliburCall[]; feeAddress: PoolFeeAddressOutcome } {
  if (!isAddressEqual(input.feeAddress, input.from)) {
    return { calls: input.handoverCalls, feeAddress: "unchanged" };
  }
  if ((input.sealState & POOL_SEAL_FEE_ADDRESS) !== 0) {
    return { calls: input.handoverCalls, feeAddress: "sealed" };
  }
  return {
    calls: [
      {
        to: input.poolAddress,
        value: "0",
        data: encodeFunctionData({
          abi: swapPoolSetFeeAddressAbi,
          functionName: "setFeeAddress",
          args: [input.to],
        }),
      },
      ...input.handoverCalls,
    ],
    feeAddress: "moved",
  };
}
