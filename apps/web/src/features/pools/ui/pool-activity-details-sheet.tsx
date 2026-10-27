import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

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
import {
  legAmount,
  usePoolActivityDetails,
} from "#/features/pools/hooks/use-pool-activity-details";
import type { PoolActivityEntry } from "#/features/pools/logic/pool-activity";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
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
  const { locale, settlement, feeBreakdown, explorerUrl, kind, copy } = usePoolActivityDetails({
    poolAddress,
    entry,
    open,
  });

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="max-h-[85svh] overflow-y-auto [&>div:first-child]:hidden">
          <SheetHeader className="items-center px-6 pt-5 pb-3 text-center">
            <Badge caps>{kind}</Badge>
            <SheetTitle className="sr-only">
              <Trans>Pool activity details</Trans>
            </SheetTitle>
          </SheetHeader>

          {entry ? (
            <div className="space-y-3 px-6 pb-2">
              <div className="border border-border bg-card">
                <DetailRow label={t`Status`}>
                  <Badge variant={entry.success ? "primary" : "muted"} size="sm" caps>
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
                      tap
                      pending={settlement.isFetching}
                      onClick={() => void settlement.refetch()}
                    >
                      <Trans>Try again</Trans>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <SheetFooter className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button asChild tap className="w-full">
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
