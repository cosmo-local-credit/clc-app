import { Trans, useLingui } from "@lingui/react/macro";

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
import { EllipsizedAddress } from "./wallet-address";

export type TransferDetails = {
  txHash: string;
  direction: "IN" | "OUT";
  recipientAddress: string;
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
  const explorerUrl = transfer ? `https://celoscan.io/tx/${transfer.txHash}` : "#";

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
          <SheetHeader className="items-center px-6 pt-5 pb-3 text-center">
            <span className="rounded-full bg-primary px-3 py-1 font-semibold text-[0.6875rem] text-primary-foreground uppercase tracking-[0.06em]">
              {badge}
            </span>
            <SheetTitle className="sr-only">
              <Trans>Transaction details</Trans>
            </SheetTitle>
          </SheetHeader>

          {transfer ? (
            <div className="space-y-3 px-6 pb-2">
              <div className="flex items-center justify-between gap-3 border border-border bg-card p-3">
                <span className="text-muted-foreground text-xs">
                  <Trans>Status</Trans>
                </span>
                <span className="font-semibold text-sm">{status}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border border-border bg-card p-3">
                <span className="text-muted-foreground text-xs">
                  <Trans>Recipient</Trans>
                </span>
                <EllipsizedAddress address={transfer.recipientAddress} />
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
