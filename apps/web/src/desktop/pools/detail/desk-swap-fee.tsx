import {
  formatPoolSwapFeePercentage,
  type PoolSwapFeeBreakdownRaw,
} from "@clc/core/features/pool-swaps/logic";

import { formatPoolSwapFee } from "#/features/pools/logic/pool-swap-fees";

/**
 * A swap fee as one start-aligned line for a desktop KV value: "5.00 KFP" and
 * its share of the gross out amount. The same figures `PoolSwapFeeValue`
 * stacks end-aligned on the phone.
 */
export function DeskSwapFee({
  breakdown,
  part,
  decimals,
  symbol,
  locale,
  pending = false,
  amountRaw,
}: {
  breakdown: PoolSwapFeeBreakdownRaw | null | undefined;
  part: "pool" | "protocol" | "total";
  decimals: number | null | undefined;
  symbol: string | undefined;
  locale: string;
  pending?: boolean;
  /** A legacy event can verify one fee amount without a full breakdown. */
  amountRaw?: string | null;
}) {
  if (pending) return <span className="text-muted-foreground">…</span>;
  const feeRaw = breakdown
    ? part === "pool"
      ? breakdown.poolFeeRaw
      : part === "protocol"
        ? breakdown.protocolFeeRaw
        : breakdown.totalFeeRaw
    : amountRaw;
  if (
    feeRaw === null ||
    feeRaw === undefined ||
    decimals === null ||
    decimals === undefined ||
    !symbol
  ) {
    return <span className="text-muted-foreground">—</span>;
  }
  const percentage = breakdown?.grossAmountOutRaw
    ? formatPoolSwapFeePercentage({
        feeRaw,
        grossAmountOutRaw: breakdown.grossAmountOutRaw,
        locale,
      })
    : null;
  return (
    <span dir="ltr" className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">
        {formatPoolSwapFee(feeRaw, decimals, locale)} {symbol}
      </span>
      {percentage ? (
        <span className="shrink-0 text-xs font-normal text-muted-foreground">{percentage}</span>
      ) : null}
    </span>
  );
}
