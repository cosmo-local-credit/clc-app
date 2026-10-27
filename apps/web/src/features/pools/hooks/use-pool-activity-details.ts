import { poolSwapFeeBreakdownRaw } from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";

import { usePoolSwapSettlement } from "#/features/pools/hooks/use-pool-swap-settlement";
import type { PoolActivityEntry, PoolActivityLeg } from "#/features/pools/logic/pool-activity";
import { formatTransferUnitValue } from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";

/**
 * One pool event, with everything the transfers feed recorded about it.
 *
 * The activity entry comes from `token_transfer`, while an opened swap also
 * reads its transaction receipt. The transfer feed reconstructs the legs and
 * can spot a separate protocol transfer; the settlement event supplies the
 * pool fee that never moved and the authoritative complete fee split.
 */
export function usePoolActivityDetails({
  poolAddress,
  entry,
  open,
}: {
  poolAddress: string;
  entry: PoolActivityEntry | null;
  open: boolean;
}) {
  const { i18n, t } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  const swapEntry = entry?.kind === "swap" ? entry : null;
  const settlement = usePoolSwapSettlement({
    txHash: open && swapEntry ? swapEntry.txHash : undefined,
    poolAddress,
    tokenIn: swapEntry?.received.tokenAddress,
    tokenOut: swapEntry?.sent.tokenAddress,
    amountInRaw: swapEntry?.received.amount,
    amountOutRaw: swapEntry?.sent.amount,
  });
  const feeBreakdown = activityFeeBreakdown(swapEntry, settlement.data);
  const explorerUrl = entry ? explorerTxUrl(CHAIN_INFO, entry.txHash) : "#";
  // Spelled out here rather than in a helper taking `t`: the macro only
  // compiles calls on the `t` it destructured, and a passed-in one reaches the
  // runtime with a bare template array and renders nothing.
  const kind = !entry
    ? ""
    : entry.kind === "swap"
      ? t`Swap`
      : entry.kind === "mint"
        ? t`Created`
        : entry.direction === "IN"
          ? t`Deposit`
          : t`Paid out`;
  const copy = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t`Couldn't copy transaction hash`);
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(t`Transaction hash copied`))
      .catch(() => toast.error(t`Couldn't copy transaction hash`));
  };

  return { locale, settlement, feeBreakdown, explorerUrl, kind, copy };
}

/** A leg as "1.00 KFP (1.00 KES)": the token amount, then its historical value. */
export function legAmount(leg: PoolActivityLeg, locale: string): string {
  const tokenAmount = `${formatTokenAmount(leg.amount, leg.tokenDecimals)} ${leg.tokenSymbol}`;
  const unitValue = formatTransferUnitValue(leg.uoaValue, leg.uoa, locale);
  return `${tokenAmount}${unitValue ? ` (${unitValue})` : ""}`;
}

function activityFeeBreakdown(
  entry: Extract<PoolActivityEntry, { kind: "swap" }> | null,
  settlement: ReturnType<typeof usePoolSwapSettlement>["data"],
) {
  if (settlement?.source === "settlement") return settlement.breakdown;
  if (!entry || settlement?.source !== "legacy" || !entry.protocolFee) return null;
  if (entry.protocolFee.tokenAddress.toLowerCase() !== entry.sent.tokenAddress.toLowerCase()) {
    return null;
  }
  try {
    const poolFee = BigInt(settlement.poolFeeRaw);
    const protocolFee = BigInt(entry.protocolFee.amount);
    const net = BigInt(entry.sent.amount);
    return poolSwapFeeBreakdownRaw({
      grossAmountOutRaw: (net + poolFee + protocolFee).toString(),
      netAmountOutRaw: net.toString(),
      poolFeeRaw: poolFee.toString(),
    });
  } catch {
    return null;
  }
}
