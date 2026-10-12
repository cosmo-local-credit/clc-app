import { poolSwapFeeBreakdownRaw } from "@clc/core/features/pool-swaps/logic";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CopyableInfoValue } from "#/components/ui/copyable-info-value";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { EllipsizedAddress, SignedAmount } from "#/components/wallet";
import { usePoolSwapSettlement } from "#/features/pools/hooks/use-pool-swap-settlement";
import type { PoolActivityEntry, PoolActivityLeg } from "#/features/pools/logic/pool-activity";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";
import { PoolSwapFeeValue } from "./pool-swap-fee-value";

/**
 * One pool event, with everything the transfers feed recorded about it.
 *
 * Not the wallet's `TransferDetailsSheet`: that one describes a single transfer
 * and looks up the private attachment a sender may have left, neither of which
 * fits a pool. A swap here is two legs and sometimes a third for the protocol's
 * cut, and the whole point of the activity list is that those belong together.
 *
 * The activity entry comes from `token_transfer`, while an opened swap also
 * reads its transaction receipt. The transfer feed reconstructs the legs and
 * can spot a separate protocol transfer; the settlement event supplies the
 * pool fee that never moved and the authoritative complete fee split.
 */
export function PoolActivityDetailsSheet({
  poolAddress,
  entry,
  open,
  onOpenChange,
}: {
  poolAddress: string;
  entry: PoolActivityEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="max-h-[85svh] overflow-y-auto rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="items-center px-6 pt-5 pb-3 text-center">
            <Badge className="h-6 px-2 text-[0.625rem] uppercase tracking-[0.08em]">{kind}</Badge>
            <SheetTitle className="sr-only">
              <Trans>Pool activity details</Trans>
            </SheetTitle>
          </SheetHeader>

          {entry ? (
            <div className="space-y-3 px-6 pb-2">
              <div className="border border-border bg-card">
                <DetailRow label={t`Status`}>
                  <Badge
                    variant={entry.success ? "primary" : "muted"}
                    className="h-5 px-2 text-[0.625rem] uppercase tracking-[0.06em]"
                  >
                    {entry.success ? t`Confirmed` : t`Failed`}
                  </Badge>
                </DetailRow>

                {entry.kind === "swap" ? (
                  <>
                    <DetailRow label={t`Pool received`}>
                      <SignedAmount direction="in" amount={legAmount(entry.received, locale)} />
                    </DetailRow>
                    <DetailRow label={t`Pool paid out`}>
                      <SignedAmount direction="out" amount={legAmount(entry.sent, locale)} />
                    </DetailRow>
                    <DetailRow label={t`Pool fee`}>
                      <PoolSwapFeeValue
                        breakdown={feeBreakdown}
                        part="pool"
                        decimals={entry.sent.tokenDecimals}
                        symbol={entry.sent.tokenSymbol}
                        locale={i18n.locales?.[0] ?? i18n.locale}
                        pending={settlement.isFetching}
                        amountRaw={
                          settlement.data?.source === "legacy"
                            ? settlement.data.poolFeeRaw
                            : undefined
                        }
                      />
                    </DetailRow>
                    <DetailRow label={t`Protocol fee`}>
                      <PoolSwapFeeValue
                        breakdown={feeBreakdown}
                        part="protocol"
                        decimals={entry.sent.tokenDecimals}
                        symbol={entry.sent.tokenSymbol}
                        locale={i18n.locales?.[0] ?? i18n.locale}
                        pending={settlement.isFetching && !entry.protocolFee}
                        amountRaw={entry.protocolFee?.amount}
                      />
                    </DetailRow>
                    <DetailRow label={t`Total fees`}>
                      <PoolSwapFeeValue
                        breakdown={feeBreakdown}
                        part="total"
                        decimals={entry.sent.tokenDecimals}
                        symbol={entry.sent.tokenSymbol}
                        locale={i18n.locales?.[0] ?? i18n.locale}
                        pending={settlement.isFetching}
                      />
                    </DetailRow>
                  </>
                ) : (
                  <DetailRow label={t`Amount`}>
                    <SignedAmount
                      direction={entry.kind === "mint" || entry.direction === "IN" ? "in" : "out"}
                      amount={legAmount(entry.leg, locale)}
                    />
                  </DetailRow>
                )}

                <DetailRow label={t`Voucher`}>
                  <span className="min-w-0 break-words text-end text-xs font-semibold">
                    {entry.kind === "swap" ? entry.sent.tokenName : entry.leg.tokenName}
                  </span>
                </DetailRow>
                {entry.kind === "swap" ? (
                  <DetailRow label={t`Received voucher`}>
                    <span className="min-w-0 break-words text-end text-xs font-semibold">
                      {entry.received.tokenName}
                    </span>
                  </DetailRow>
                ) : null}

                <DetailRow label={t`From`}>
                  {entry.kind === "mint" ? (
                    <span className="text-xs font-semibold">
                      <Trans>New supply</Trans>
                    </span>
                  ) : (
                    <EllipsizedAddress address={entry.detail.senderAddress} />
                  )}
                </DetailRow>
                <DetailRow label={t`To`}>
                  <EllipsizedAddress address={entry.detail.recipientAddress} />
                </DetailRow>

                <DetailRow label={t`Date`}>
                  <time className="font-mono text-xs font-semibold" dateTime={entry.dateBlock}>
                    {formatTransferDate(entry.dateBlock)}
                  </time>
                </DetailRow>
                <DetailRow label={t`Transaction`}>
                  <CopyableInfoValue
                    value={entry.txHash}
                    label={t`Copy transaction hash`}
                    onCopy={copy}
                  />
                </DetailRow>
              </div>
              {entry.kind === "swap" && settlement.data?.source === "legacy" && !feeBreakdown ? (
                <p role="status" className="text-muted-foreground text-xs">
                  <Trans>Complete fee details are unavailable for this swap.</Trans>
                </p>
              ) : entry.kind === "swap" &&
                !settlement.data &&
                (!settlement.canLoad || settlement.isError) ? (
                <div className="flex items-center justify-between gap-3">
                  <p role="alert" className="text-muted-foreground text-xs">
                    <Trans>Fee details unavailable.</Trans>
                  </p>
                  {settlement.canLoad ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 bg-card"
                      onClick={() => settlement.refetch()}
                    >
                      <Trans>Try again</Trans>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button asChild className="h-11 w-full">
              <a href={explorerUrl} target="_blank" rel="noreferrer">
                <Trans>View on block explorer</Trans>
              </a>
            </Button>
          </SheetFooter>
        </SheetContent>
      </SheetPortal>
    </SheetRoot>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="flex min-w-0 items-center justify-end">{children}</span>
    </div>
  );
}

function legAmount(leg: PoolActivityLeg, locale: string): string {
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
