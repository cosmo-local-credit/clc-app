import type {
  AccountActivityItem,
  AccountTransfersResult,
} from "@clc/api/features/accounts/client";

export type PoolTransfer = AccountTransfersResult["transfers"][number];

/** One side of a pool event: what token moved, and how much of it. */
export type PoolActivityLeg = {
  tokenAddress: string;
  tokenSymbol: string;
  /** Carried alongside the ticker so a details sheet can name the voucher. */
  tokenName: string;
  tokenDecimals: number;
  amount: string;
  /** Historical value derived from this indexed amount and its submission-time claim. */
  uoaValue?: string;
  uoa?: string;
};

/** One classified pool operation from the server, independent of page boundaries. */
type PoolActivityBase = {
  /** Stable across renders and across appended pages. */
  key: string;
  txHash: string;
  dateBlock: string;
  success: boolean;
  /** The transfer a details sheet opens on. */
  detail: PoolTransfer;
  initiatorAddress?: string;
};

/** A classified swap, with both token legs from the server. */
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
      kind: "transfer" | "withdrawal" | "fee-withdrawal" | "payout";
      nominalAmount?: string;
      direction: "IN" | "OUT";
      counterpartyAddress: string;
      leg: PoolActivityLeg;
    });

/** Adapt the server's operation facts; never infer swaps from partial pages. */
export function poolActivityFromAccount(
  item: AccountActivityItem,
  poolAddress: string,
): PoolActivityEntry {
  const direction =
    item.kind === "swapped"
      ? "OUT"
      : item.direction === "IN" ||
          (!item.direction && item.recipientAddress.toLowerCase() === poolAddress.toLowerCase())
        ? "IN"
        : "OUT";
  const movement = item.kind === "swapped" ? item.sent : item.transfer;
  const counterparty = item.counterpartyAddress ?? item.initiatorAddress ?? "";
  const detail: PoolTransfer = {
    ...movement,
    id: item.id,
    txHash: item.txHash,
    dateBlock: item.dateBlock,
    success: item.success,
    direction,
    counterpartyAddress: counterparty,
    senderAddress: item.senderAddress ?? poolAddress,
    recipientAddress: item.recipientAddress ?? counterparty,
    hasNote: item.kind === "swapped" ? false : item.hasNote,
  };
  const base = {
    key: `${item.txHash}-${item.id}`,
    txHash: item.txHash,
    dateBlock: item.dateBlock,
    success: item.success,
    initiatorAddress: item.initiatorAddress,
    detail,
  };
  if (item.kind === "swapped")
    return {
      ...base,
      kind: "swap",
      counterpartyAddress: counterparty,
      received: item.received,
      sent: item.sent,
      protocolFee: item.protocolFee ?? null,
    };
  if (item.kind === "creation") return { ...base, kind: "mint", leg: movement };
  const kind =
    item.kind === "withdrawn"
      ? "withdrawal"
      : item.kind === "fee_withdrawn"
        ? "fee-withdrawal"
        : item.kind === "pool_payout"
          ? "payout"
          : "transfer";
  return {
    ...base,
    kind,
    nominalAmount: item.nominalAmount,
    direction,
    counterpartyAddress: counterparty,
    leg: movement,
  };
}
