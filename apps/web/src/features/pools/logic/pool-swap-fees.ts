import { POOL_FEE_PPM } from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";

/**
 * A swap fee at the swap screen's two decimals.
 *
 * A fee too small to show there reads "<0.01" rather than "0.00". The protocol's
 * cut of a small swap is a fraction of a cent, and a zero beside a received
 * amount that is visibly short of the rate is the confusion the breakdown exists
 * to remove.
 */
export function formatPoolSwapFee(raw: string, decimals: number, locale: string): string {
  const smallestShown = 10n ** BigInt(Math.max(decimals - 2, 0));
  const amount = BigInt(raw);
  if (amount > 0n && amount < smallestShown) {
    return `<${formatTokenAmountFixed(smallestShown.toString(), decimals, 2, locale)}`;
  }
  return formatTokenAmountFixed(raw, decimals, 2, locale);
}

/** A pool fee rate held in ppm, as a localized percentage exact to the ppm. */
export function formatPoolFeePercent(feePpm: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 4 }).format(
    Number(feePpm) / Number(POOL_FEE_PPM),
  );
}
