import {
  type PoolSwapFeeBreakdownRaw,
  poolSwapFeeBreakdownRaw,
  swapPoolSwapEventAbi,
  swapPoolSwapSettlementEventAbi,
} from "./logic";
import { decodeEventLog, encodeEventTopics, type Hex } from "viem";

const SWAP_SETTLEMENT_TOPIC = encodeEventTopics({
  abi: swapPoolSwapSettlementEventAbi,
  eventName: "SwapSettlement",
})[0];

export type PoolSwapReceiptLog = {
  address: string;
  data: Hex;
  topics: readonly Hex[];
};

export type PoolSwapSettlementResult =
  | {
      source: "settlement";
      breakdown: PoolSwapFeeBreakdownRaw;
    }
  | {
      source: "legacy";
      breakdown: null;
      poolFeeRaw: string;
    };

export type PoolSwapSettlementMatch = {
  poolAddress: string;
  tokenIn?: string;
  tokenOut?: string;
  amountInRaw?: string;
  amountOutRaw?: string;
};

/**
 * Finds the one swap settlement that belongs to the receipt being displayed.
 *
 * Current pools emit both `Swap` and `SwapSettlement`, so the detailed event is
 * always preferred. A transaction may contain several relayed calls; optional
 * token and amount constraints prevent a receipt from borrowing another hop's
 * fees. If more than one event still matches, no result is safer than a guess.
 */
export function findPoolSwapSettlement(
  logs: readonly PoolSwapReceiptLog[],
  match: PoolSwapSettlementMatch,
): PoolSwapSettlementResult | null {
  const poolLogs = logs.filter((log) => sameAddress(log.address, match.poolAddress));
  const settlements: Array<Extract<PoolSwapSettlementResult, { source: "settlement" }>> = [];
  let malformedSettlement = false;
  for (const log of poolLogs) {
    if (log.topics[0]?.toLowerCase() !== SWAP_SETTLEMENT_TOPIC?.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: swapPoolSwapSettlementEventAbi,
        eventName: "SwapSettlement",
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      const args = decoded.args;
      if (
        !matchesAddress(args.tokenIn, match.tokenIn) ||
        !matchesAddress(args.tokenOut, match.tokenOut) ||
        !matchesRaw(args.amountIn, match.amountInRaw) ||
        !matchesEitherRaw(args.nominalAmountOut, args.amountOut, match.amountOutRaw)
      ) {
        continue;
      }

      const breakdown = poolSwapFeeBreakdownRaw({
        grossAmountOutRaw: args.quotedAmountOut.toString(),
        netAmountOutRaw: args.nominalAmountOut.toString(),
        poolFeeRaw: args.poolFee.toString(),
      });
      if (!breakdown || breakdown.protocolFeeRaw !== args.protocolFee.toString()) {
        malformedSettlement = true;
        continue;
      }
      settlements.push({ source: "settlement", breakdown });
    } catch {
      malformedSettlement = true;
    }
  }

  if (malformedSettlement) return null;
  if (settlements.length === 1) return settlements[0] ?? null;
  if (settlements.length > 1) return null;

  const legacy = poolLogs.flatMap((log) => {
    try {
      const decoded = decodeEventLog({
        abi: swapPoolSwapEventAbi,
        eventName: "Swap",
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      const args = decoded.args;
      if (
        !matchesAddress(args.tokenIn, match.tokenIn) ||
        !matchesAddress(args.tokenOut, match.tokenOut) ||
        !matchesRaw(args.amountIn, match.amountInRaw) ||
        !matchesRaw(args.amountOut, match.amountOutRaw)
      ) {
        return [];
      }
      return [{ source: "legacy" as const, breakdown: null, poolFeeRaw: args.fee.toString() }];
    } catch {
      return [];
    }
  });

  return legacy.length === 1 ? (legacy[0] ?? null) : null;
}

function matchesAddress(actual: string, expected: string | undefined): boolean {
  return expected === undefined || sameAddress(actual, expected);
}

function matchesRaw(actual: bigint, expected: string | undefined): boolean {
  if (expected === undefined) return true;
  try {
    return actual === BigInt(expected);
  } catch {
    return false;
  }
}

function matchesEitherRaw(left: bigint, right: bigint, expected: string | undefined): boolean {
  return matchesRaw(left, expected) || matchesRaw(right, expected);
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
