import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { RiArrowLeftDownLine, RiArrowRightUpLine, RiChat1Line } from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { EllipsizedAddress, TransferDetailsSheet, type TransferDetails } from "#/components/wallet";
import { useAccountTransfersInfinite } from "#/features/wallet/hooks/use-account-balances";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";

export function ActivityPage({ address }: { address?: string }) {
  const { t } = useLingui();
  const transfersQuery = useAccountTransfersInfinite(address, { poll: true });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const transfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !transfersQuery.hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && !transfersQuery.isFetchingNextPage) {
        void transfersQuery.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [transfersQuery.fetchNextPage, transfersQuery.hasNextPage, transfersQuery.isFetchingNextPage]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1>{t`Activity`}</h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Recent voucher transfers for this wallet.</Trans>
        </p>
      </div>

      <section className="border border-border bg-card" aria-label={t`Transfer history`}>
        {transfersQuery.isPending ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>Loading activity…</Trans>
          </div>
        ) : null}
        {transfersQuery.isError ? (
          <div className="space-y-2 p-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load activity.</Trans>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-9 bg-card"
              onClick={() => transfersQuery.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {transfersQuery.isSuccess && transfers.length === 0 ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>No activity yet.</Trans>
          </div>
        ) : null}
        {transfers.map((transfer, index, list) => {
          const incoming = transfer.direction === "IN";
          const Icon = incoming ? RiArrowLeftDownLine : RiArrowRightUpLine;
          const transferDate = formatTransferDate(transfer.dateBlock);
          return (
            <button
              key={`${transfer.txHash}-${transfer.id}`}
              type="button"
              className={[
                "flex w-full items-center gap-2.5 p-3 text-start",
                index < list.length - 1 ? "border-b border-border" : "",
              ].join(" ")}
              onClick={() => setSelectedTransfer(transfer)}
            >
              <span
                className={[
                  "flex size-7 shrink-0 items-center justify-center bg-muted",
                  incoming ? "text-primary" : "text-destructive",
                ].join(" ")}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {incoming ? <Trans>Received</Trans> : <Trans>Sent</Trans>}
                  {transfer.hasNote ? (
                    <>
                      <RiChat1Line
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="sr-only">
                        <Trans>Has a message</Trans>
                      </span>
                    </>
                  ) : null}
                </p>
                <p className="truncate text-muted-foreground text-[0.6875rem]">
                  {incoming ? <Trans>From</Trans> : <Trans>To</Trans>}{" "}
                  <EllipsizedAddress address={transfer.counterpartyAddress} />
                  {transferDate ? (
                    <>
                      <span aria-hidden="true"> · </span>
                      <time dateTime={transfer.dateBlock}>{transferDate}</time>
                    </>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs font-semibold">
                {formatTokenAmount(transfer.amount, transfer.tokenDecimals)} {transfer.tokenSymbol}
              </span>
            </button>
          );
        })}
        <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
        {transfersQuery.isFetchingNextPage ? (
          <div className="p-3 text-center text-muted-foreground text-xs">
            <Trans>Loading more…</Trans>
          </div>
        ) : null}
      </section>

      <TransferDetailsSheet
        transfer={selectedTransfer}
        open={selectedTransfer !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTransfer(null);
        }}
      />
    </div>
  );
}
