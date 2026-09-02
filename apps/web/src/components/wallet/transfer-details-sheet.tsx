import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { Suspense } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { LocationMap } from "#/components/ui/location-map.lazy";
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
import { useSendShare } from "#/features/wallet/hooks/use-send-share";
import { CHAIN_INFO } from "#/lib/chain";
import { explorerTxUrl } from "@clc/core/lib/constants/chains";
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
  const explorerUrl = transfer ? explorerTxUrl(CHAIN_INFO, transfer.txHash) : "#";
  const shareQuery = useSendShare(transfer?.txHash ?? null, open && transfer?.success === true);

  return (
    <SheetRoot open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetBackdrop />
        <SheetContent className="max-h-[85svh] overflow-y-auto rounded-none border-t border-border bg-background shadow-none [&>div:first-child]:hidden">
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

          <PrivateShareSection query={shareQuery} />

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

function PrivateShareSection({ query }: { query: ReturnType<typeof useSendShare> }) {
  const share = query.data;

  if (query.isPending && query.fetchStatus !== "idle") {
    return (
      <div className="px-6 pb-2 text-muted-foreground text-xs">
        <Trans>Loading private attachment…</Trans>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="px-6 pb-2 text-destructive text-xs">
        <Trans>Couldn't load the private attachment.</Trans>
      </div>
    );
  }
  if (!share) return null;

  return (
    <section className="px-6 pb-2" aria-label="Private attachment">
      <div className="space-y-3 border border-border bg-card p-3">
        <div>
          <p className="font-semibold text-sm">
            <Trans>Private attachment</Trans>
          </p>
          <p className="text-muted-foreground text-xs">
            <Trans>Shared by {share.sharedBy.name}</Trans>
          </p>
        </div>

        {share.note ? (
          <p className="whitespace-pre-wrap break-words border-l-2 border-primary pl-3 text-sm">
            {share.note}
          </p>
        ) : null}

        <div className="space-y-2 text-xs">
          {share.sharedBy.email ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                <Trans>Email</Trans>
              </span>
              <a
                className="break-all font-semibold text-primary"
                href={`mailto:${share.sharedBy.email}`}
              >
                {share.sharedBy.email}
              </a>
            </div>
          ) : null}
          {share.sharedBy.phone ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                <Trans>Phone</Trans>
              </span>
              <a className="font-semibold text-primary" href={`tel:${share.sharedBy.phone}`}>
                {share.sharedBy.phone}
              </a>
            </div>
          ) : null}
          {share.sharedBy.location ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-muted-foreground">
                  <Trans>Location</Trans>
                </span>
                <span className="text-right font-semibold">
                  {share.sharedBy.location.locationName}
                </span>
              </div>
              <Suspense fallback={<div className="h-36 w-full bg-muted" />}>
                <LocationMap
                  lat={share.sharedBy.location.lat}
                  lng={share.sharedBy.location.lng}
                  className="h-36 rounded-none"
                />
              </Suspense>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
