import {
  formatPoolSwapFeePercentage,
  type PoolSwapFeeBreakdownRaw,
} from "@clc/core/features/pool-swaps/logic";
import { formatPoolSwapFee } from "#/features/pools/logic/pool-swap-fees";

export type PoolSwapFeePart = "pool" | "protocol" | "total";

export function PoolSwapFeeValue({
  breakdown,
  part,
  decimals,
  symbol,
  locale,
  pending = false,
  amountRaw,
  grossAmountOutRaw,
}: {
  breakdown: PoolSwapFeeBreakdownRaw | null | undefined;
  part: PoolSwapFeePart;
  decimals: number | null | undefined;
  symbol: string | undefined;
  locale: string;
  pending?: boolean;
  /** A legacy event can verify the pool-fee amount without exposing a gross quote. */
  amountRaw?: string | null;
  grossAmountOutRaw?: string | null;
}) {
  if (pending) {
    return <span className="text-muted-foreground text-xs">…</span>;
  }
  const feeRaw = breakdown
    ? part === "pool"
      ? breakdown.poolFeeRaw
      : part === "protocol"
        ? breakdown.protocolFeeRaw
        : breakdown.totalFeeRaw
    : amountRaw;
  const grossRaw = breakdown?.grossAmountOutRaw ?? grossAmountOutRaw;
  if (
    feeRaw === null ||
    feeRaw === undefined ||
    decimals === null ||
    decimals === undefined ||
    !symbol
  ) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const amount = formatPoolSwapFee(feeRaw, decimals, locale);
  const percentage = grossRaw
    ? formatPoolSwapFeePercentage({ feeRaw, grossAmountOutRaw: grossRaw, locale })
    : null;

  return (
    <span dir="ltr" className="flex min-w-0 flex-col items-end font-mono tabular-nums">
      <span className="break-words text-end text-xs font-semibold">
        {amount} {symbol}
      </span>
      <span className="text-muted-foreground text-2xs">{percentage ?? "—"}</span>
    </span>
  );
}
