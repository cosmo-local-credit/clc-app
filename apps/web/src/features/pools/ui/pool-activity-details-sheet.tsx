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
import type { PoolActivityEntry, PoolActivityLeg } from "#/features/pools/logic/pool-activity";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { CHAIN_INFO } from "#/lib/chain";

/**
 * One pool event, with everything the transfers feed recorded about it.
 *
 * Not the wallet's `TransferDetailsSheet`: that one describes a single transfer
 * and looks up the private attachment a sender may have left, neither of which
 * fits a pool. A swap here is two legs and sometimes a third for the protocol's
 * cut, and the whole point of the activity list is that those belong together.
 *
 * Every row comes from `token_transfer` — the legs, the addresses on each side,
 * the block timestamp and whether the transaction succeeded. The pool's own
 * swap fee is not among them: `SwapPool` credits it to `fees[token]` without
 * moving it, so nothing in this feed can see it. Only the protocol's cut leaves
 * in the same transaction, and that is the fee shown.
 */
export function PoolActivityDetailsSheet({
  entry,
  open,
  onOpenChange,
}: {
  entry: PoolActivityEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const explorerUrl = entry ? explorerTxUrl(CHAIN_INFO, entry.txHash) : "#";
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
            <Badge className="h-6 px-2 text-[0.625rem] uppercase tracking-[0.08em]">
              {entry ? kindLabel(entry, t) : ""}
            </Badge>
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
                      <SignedAmount direction="in" amount={legAmount(entry.received)} />
                    </DetailRow>
                    <DetailRow label={t`Pool paid out`}>
                      <SignedAmount direction="out" amount={legAmount(entry.sent)} />
                    </DetailRow>
                    {entry.protocolFee ? (
                      // Apart from the trader's side: it left in the same
                      // transaction but went to the protocol, not to them.
                      <DetailRow label={t`Protocol fee`}>
                        <span className="font-mono text-xs font-semibold">
                          {legAmount(entry.protocolFee)}
                        </span>
                      </DetailRow>
                    ) : null}
                  </>
                ) : (
                  <DetailRow label={t`Amount`}>
                    <SignedAmount
                      direction={entry.kind === "mint" || entry.direction === "IN" ? "in" : "out"}
                      amount={legAmount(entry.leg)}
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

function legAmount(leg: PoolActivityLeg): string {
  return `${formatTokenAmount(leg.amount, leg.tokenDecimals)} ${leg.tokenSymbol}`;
}

function kindLabel(entry: PoolActivityEntry, t: (strings: TemplateStringsArray) => string): string {
  if (entry.kind === "swap") return t`Swap`;
  if (entry.kind === "mint") return t`Minted`;
  return entry.direction === "IN" ? t`Deposit` : t`Paid out`;
}
