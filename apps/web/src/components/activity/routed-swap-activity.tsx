import type { RoutedSwapReceipt } from "@clc/api/features/credit-router/client";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";
import { Plural, Trans } from "@lingui/react/macro";

import { SignedAmount } from "#/components/wallet";

/** "2 hops", for a routed exchange's subtitle. */
export function RoutedSwapHops({ count }: { count: number }) {
  return <Plural value={count} one="# hop" other="# hops" />;
}

/**
 * A routed exchange the activity index has not listed yet: relayed and
 * pending, failed before it swapped, or mined moments ago.
 */
export function RoutedSwapPendingTitle({ receipt }: { receipt: RoutedSwapReceipt }) {
  const status = receipt.swap.status;
  if (status === "SUCCESS") return <Trans>Exchanged</Trans>;
  if (status !== null && status !== "PENDING" && status !== "IN_NETWORK") {
    return <Trans>Exchange failed</Trans>;
  }
  return <Trans>Exchanging</Trans>;
}

export function RoutedSwapSpent({
  receipt,
  symbol,
  decimals,
  locale,
}: {
  receipt: RoutedSwapReceipt;
  symbol: string | undefined;
  decimals: number | null | undefined;
  locale: string;
}) {
  if (!symbol || decimals === null || decimals === undefined) return null;
  return (
    <SignedAmount
      direction="out"
      amount={`${formatTokenAmountFixed(receipt.swap.amountIn, decimals, 2, locale)} ${symbol}`}
      className="flex justify-end"
    />
  );
}
