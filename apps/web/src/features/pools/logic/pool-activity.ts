import type { AccountTransfersResult } from "@clc/api/features/accounts/client";
import { isVoucherCreationTransfer } from "@clc/core/features/wallet/logic";

export type PoolTransfer = AccountTransfersResult["transfers"][number];

/** One side of a pool event: what token moved, and how much of it. */
export type PoolActivityLeg = {
  tokenAddress: string;
  tokenSymbol: string;
  /** Carried alongside the ticker so a details sheet can name the voucher. */
  tokenName: string;
  tokenDecimals: number;
  amount: string;
};

/**
 * One line of a pool's history, as a reader understands it rather than as the
 * transfer table stores it.
 *
 * clc-core exposes pool swaps to non-superadmins only as their raw ERC-20 legs:
 * `/api/v2/accounts/:address/transfers` reads `token_transfer`, and `SwapPool`
 * moves both sides of a swap with ordinary `transfer` / `transferFrom` calls, so
 * one swap arrives as two rows — three when a protocol fee is charged. The
 * `pool_swap` table that records it as a single event is behind
 * `/api/v2/admin/transactions/pools`, which this app cannot call. Reassembling
 * the swap here is therefore the whole point: listed leg by leg, a pool's
 * history claims it received and sent unrelated things all day.
 */
type PoolActivityBase = {
  /** Stable across renders and across appended pages. */
  key: string;
  txHash: string;
  dateBlock: string;
  success: boolean;
  /** The transfer a details sheet opens on. */
  detail: PoolTransfer;
};

/** The swap variant, named so the pairing pass can carry it before it is emitted. */
type PoolSwapEntry = PoolActivityBase & {
  kind: "swap";
  /** The account the pool traded with. */
  counterpartyAddress: string;
  /** What the pool took in. */
  received: PoolActivityLeg;
  /** What the pool paid out, excluding any protocol fee. */
  sent: PoolActivityLeg;
  /** The protocol's cut of the out side, when one was charged. */
  protocolFee: PoolActivityLeg | null;
};

export type PoolActivityEntry =
  | PoolSwapEntry
  | (PoolActivityBase & { kind: "mint"; leg: PoolActivityLeg })
  | (PoolActivityBase & {
      kind: "transfer";
      direction: "IN" | "OUT";
      counterpartyAddress: string;
      leg: PoolActivityLeg;
    });

/**
 * A pool's transfers, with each swap folded back into the single event it was.
 *
 * Two legs are merged only when they share a transaction hash **and** a
 * counterparty, move in opposite directions, and are different tokens. Every
 * clause is load-bearing:
 *
 * - The hash alone is not enough. A relayed batch can carry several unrelated
 *   transfers through one transaction, and pairing across counterparties would
 *   invent a trade between two people who never met.
 * - The counterparty clause also keeps the protocol-fee leg out of the pair: it
 *   is a third transfer of the out token to the fee recipient, not to the trader.
 *   That leg is attached to the swap afterwards rather than left as a stray row.
 * - Same token in and out is a correction, not a trade.
 *
 * `token_transfer.id` is the only ordering the backend gives, and the indexer
 * inserts through twenty concurrent workers, so rows within one transaction can
 * arrive either way round. Nothing here depends on their order: legs are matched
 * by looking across the whole list, and direction decides which is which.
 *
 * Order is otherwise preserved — a merged swap takes the position of its first
 * leg — so paging stays stable as later pages append. Anything unmatched stays a
 * row of its own, so nothing is ever dropped.
 */
export function buildPoolActivity(transfers: PoolTransfer[]): PoolActivityEntry[] {
  const consumed = new Set<number>();
  const swaps: Array<{ position: number; sourceIndex: number; entry: PoolSwapEntry }> = [];
  const slots: Array<PoolActivityEntry | null> = [];

  for (const [index, transfer] of transfers.entries()) {
    if (consumed.has(index)) continue;

    const partnerIndex = transfers.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        !consumed.has(candidateIndex) &&
        candidate.txHash === transfer.txHash &&
        candidate.direction !== transfer.direction &&
        sameAddress(candidate.counterpartyAddress, transfer.counterpartyAddress) &&
        !sameAddress(candidate.tokenAddress, transfer.tokenAddress),
    );

    if (partnerIndex === -1) {
      slots.push(soloEntry(transfer));
      continue;
    }

    const partner = transfers[partnerIndex] as PoolTransfer;
    consumed.add(partnerIndex);
    const received = transfer.direction === "IN" ? transfer : partner;
    const sent = transfer.direction === "IN" ? partner : transfer;

    const entry: PoolSwapEntry = {
      kind: "swap",
      key: `${entryKey(transfer)}-${partner.id}`,
      txHash: transfer.txHash,
      dateBlock: transfer.dateBlock,
      // One transaction, so either leg reverting takes both with it.
      success: transfer.success && partner.success,
      counterpartyAddress: transfer.counterpartyAddress,
      received: leg(received),
      sent: leg(sent),
      protocolFee: null,
      // The out leg: what the trader walked away with is the figure they came
      // to the pool for.
      detail: sent,
    };
    swaps.push({ position: slots.length, sourceIndex: index, entry });
    slots.push(entry);
  }

  attachProtocolFees(transfers, consumed, swaps, slots);

  return slots.filter((entry): entry is PoolActivityEntry => entry !== null);
}

/**
 * Claims the leftover leg of a swap transaction as the protocol's cut.
 *
 * `SwapPool._swap` pays the protocol in the out token, in the same transaction,
 * to an address that is not the trader — but the transfers feed names no fee
 * recipient, so the leg can only be recognised by what is left over. That is
 * safe to do exactly once: after pairing, a transaction holding **one** swap and
 * **one** unclaimed outbound leg of that swap's out token, for less than the
 * trader received, has no other reading. A transaction carrying two swaps is
 * left alone, because there the leftover could belong to either — which is the
 * misattribution this guard exists to prevent.
 */
function attachProtocolFees(
  transfers: PoolTransfer[],
  consumed: Set<number>,
  swaps: Array<{ position: number; sourceIndex: number; entry: PoolSwapEntry }>,
  slots: Array<PoolActivityEntry | null>,
): void {
  for (const swap of swaps) {
    if (swaps.filter((other) => other.entry.txHash === swap.entry.txHash).length !== 1) continue;

    const candidates = transfers
      .map((transfer, index) => ({ transfer, index }))
      .filter(
        ({ transfer, index }) =>
          index !== swap.sourceIndex &&
          !consumed.has(index) &&
          transfer.txHash === swap.entry.txHash,
      );
    const [only] = candidates;
    if (candidates.length !== 1 || !only) continue;

    const { transfer, index } = only;
    if (
      transfer.direction !== "OUT" ||
      !sameAddress(transfer.tokenAddress, swap.entry.sent.tokenAddress) ||
      sameAddress(transfer.counterpartyAddress, swap.entry.counterpartyAddress) ||
      !isLessThan(transfer.amount, swap.entry.sent.amount)
    ) {
      continue;
    }

    consumed.add(index);
    slots[swap.position] = { ...swap.entry, protocolFee: leg(transfer) };
    // The stray row the fee produced was emitted before this pass could claim
    // it; drop it now that it has a home.
    const strayPosition = slots.findIndex(
      (entry) => entry !== null && entry.kind !== "swap" && entry.detail.id === transfer.id,
    );
    if (strayPosition !== -1) slots[strayPosition] = null;
  }
}

function isLessThan(left: string, right: string): boolean {
  try {
    return BigInt(left) < BigInt(right);
  } catch {
    return false;
  }
}

/**
 * A leg with nothing to pair against.
 *
 * A deposit, a fee sweep and a liquidity withdrawal are all genuinely one-sided,
 * and the last two are indistinguishable from an ordinary transfer — `Collect`
 * is not indexed and `withdrawLiquidity` emits nothing — so they are reported as
 * what the chain shows rather than guessed at. A mint is separated out because
 * `token_transfer` carries no zero-address exclusion, and "received from
 * 0x0000…0000" describes an issuance as if it had a sender.
 */
function soloEntry(transfer: PoolTransfer): PoolActivityEntry {
  const base = {
    key: entryKey(transfer),
    txHash: transfer.txHash,
    dateBlock: transfer.dateBlock,
    success: transfer.success,
    detail: transfer,
  };

  if (isVoucherCreationTransfer(transfer)) {
    return { ...base, kind: "mint", leg: leg(transfer) };
  }

  return {
    ...base,
    kind: "transfer",
    direction: transfer.direction,
    counterpartyAddress: transfer.counterpartyAddress,
    leg: leg(transfer),
  };
}

function entryKey(transfer: PoolTransfer): string {
  return `${transfer.txHash}-${transfer.id}`;
}

function leg(transfer: PoolTransfer): PoolActivityLeg {
  return {
    tokenAddress: transfer.tokenAddress,
    tokenSymbol: transfer.tokenSymbol,
    tokenName: transfer.tokenName,
    tokenDecimals: transfer.tokenDecimals,
    amount: transfer.amount,
  };
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
