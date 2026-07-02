import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  SheetBackdrop,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetPortal,
  SheetRoot,
  SheetTitle,
} from "#/components/ui/sheet";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { EllipsizedAddress } from "./wallet-address";

export type TransferDetails = {
  txHash: string;
  direction: "IN" | "OUT";
  recipientAddress: string;
  tokenDecimals: number;
  tokenSymbol: string;
  amount: string;
  dateBlock: string;
  success: boolean;
};

export function TransferDetailsSheet({
  transfer,
  open,
  onOpenChange,
}: {
  transfer: TransferDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const badge = transfer?.direction === "IN" ? t`Received voucher` : t`Sent voucher`;
  const status = transfer?.success ? t`Confirmed` : t`Failed`;
  const transferDate = transfer ? formatTransferDate(transfer.dateBlock) : "";
  const explorerUrl = transfer ? `https://celoscan.io/tx/${transfer.txHash}` : "#";

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="items-center px-6 pt-5 pb-3 text-center">
            <Badge className="h-6 px-2 text-[0.625rem] uppercase tracking-[0.08em]">{badge}</Badge>
            <SheetTitle className="sr-only">
              <Trans>Transaction details</Trans>
            </SheetTitle>
          </SheetHeader>

          {transfer ? (
            <div className="px-6 pb-2">
              <div className="border border-border bg-card">
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Status</Trans>
                  </span>
                  <Badge
                    variant={transfer.success ? "primary" : "muted"}
                    className="h-5 px-2 text-[0.625rem] uppercase tracking-[0.06em]"
                  >
                    {status}
                  </Badge>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Amount</Trans>
                  </span>
                  <span className="font-mono text-xs font-semibold">
                    {formatTokenAmount(transfer.amount, transfer.tokenDecimals)}{" "}
                    {transfer.tokenSymbol}
                  </span>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Date</Trans>
                  </span>
                  <time className="font-mono text-xs font-semibold" dateTime={transfer.dateBlock}>
                    {transferDate}
                  </time>
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-muted-foreground text-xs">
                    <Trans>Recipient</Trans>
                  </span>
                  <EllipsizedAddress address={transfer.recipientAddress} />
                </div>
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
