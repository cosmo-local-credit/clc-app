import { MarketFeedBar } from "#/components/market-bar";
import { Input } from "#/components/ui/input";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { formatTokenAmount, isVoucherCreationTransfer } from "@clc/core/features/wallet/logic";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiChat1Line,
  RiSparkling2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import { TransferDetailsSheet, type TransferDetails } from "#/components/wallet";
import { useAccountTransfersInfinite } from "#/features/wallet/hooks/use-account-balances";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";

export function ActivityPage({ address }: { address?: string }) {
  const { i18n, t } = useLingui();
  const transfersQuery = useAccountTransfersInfinite(address, { poll: true });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const [query, setQuery] = useState("");
  const transfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];

  const term = query.trim().toLocaleLowerCase();
  const matchingTransfers = transfers.filter((transfer) =>
    [
      transfer.tokenName,
      transfer.tokenSymbol,
      transfer.tokenAddress,
      transfer.counterpartyAddress,
      transfer.txHash,
      transfer.dateBlock,
      formatTokenAmount(transfer.amount, transfer.tokenDecimals),
      isVoucherCreationTransfer(transfer)
        ? t`Created`
        : transfer.direction === "IN"
          ? t`Received`
          : t`Sent`,
    ].some((value) => value.toLocaleLowerCase().includes(term)),
  );

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      term ||
      !target ||
      !transfersQuery.hasNextPage ||
      typeof IntersectionObserver === "undefined"
    ) {
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
  }, [
    term,
    transfersQuery.fetchNextPage,
    transfersQuery.hasNextPage,
    transfersQuery.isFetchingNextPage,
  ]);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">{t`Activity`}</h1>
      <MarketFeedBar current="activity">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t({ id: "Search loaded activity", message: "Search loaded activity" })}
          placeholder={t({ id: "Search loaded activity", message: "Search loaded activity" })}
        />
      </MarketFeedBar>
      {term && transfersQuery.hasNextPage ? (
        <p className="text-sm text-muted-foreground">
          <Trans id="Search covers loaded transfers. Load more to search older activity.">
            Search covers loaded transfers. Load more to search older activity.
          </Trans>
        </p>
      ) : null}

      <section className="border border-border bg-card" aria-label={t`Transfer history`}>
        {transfersQuery.isPending ? (
          <ListSkeleton framed={false} label={<Trans>Loading activity…</Trans>} />
        ) : null}
        {transfersQuery.isError ? (
          <div className="space-y-2 p-3">
            <p className="text-muted-foreground text-sm">
              <Trans>Couldn't load activity.</Trans>
            </p>
            <Button
              variant="outline"
              tap
              pending={transfersQuery.isFetching}
              onClick={() => void transfersQuery.refetch()}
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
        {matchingTransfers.map((transfer, index, list) => {
          const incoming = transfer.direction === "IN";
          const created = isVoucherCreationTransfer(transfer);
          const Icon = created
            ? RiSparkling2Line
            : incoming
              ? RiArrowLeftDownLine
              : RiArrowRightUpLine;
          const transferDate = formatTransferDate(transfer.dateBlock);
          const uoaLabel = formatTransferUnitValue(
            transfer.uoaValue,
            transfer.uoa,
            i18n.locales?.[0] ?? i18n.locale,
          );
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
                  created ? "text-foreground" : incoming ? "text-primary" : "text-destructive",
                ].join(" ")}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {created ? (
                    <Trans>Created</Trans>
                  ) : incoming ? (
                    <Trans>Received</Trans>
                  ) : (
                    <Trans>Sent</Trans>
                  )}
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
                {/* Only the counterparty truncates: a long name and username
                    must not push the date off the row. */}
                <p className="flex min-w-0 text-muted-foreground text-xs">
                  <span className="min-w-0 truncate">
                    {created ? (
                      <Trans>New supply</Trans>
                    ) : (
                      <>
                        {incoming ? <Trans>From</Trans> : <Trans>To</Trans>}{" "}
                        <RecipientIdentityLabel address={transfer.counterpartyAddress} />
                      </>
                    )}
                  </span>
                  {transferDate ? (
                    <span className="shrink-0 whitespace-pre">
                      <span aria-hidden="true"> · </span>
                      <time dateTime={transfer.dateBlock}>{transferDate}</time>
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 text-end font-mono text-xs font-semibold">
                <span className="block">
                  {formatTokenAmount(transfer.amount, transfer.tokenDecimals)}{" "}
                  {transfer.tokenSymbol}
                </span>
                {uoaLabel ? (
                  <span className="block text-muted-foreground">({uoaLabel})</span>
                ) : null}
              </span>
            </button>
          );
        })}
        {term &&
        transfersQuery.isSuccess &&
        matchingTransfers.length === 0 &&
        transfers.length > 0 ? (
          <p className="p-3 text-sm text-muted-foreground" role="status">
            <Trans id="No loaded transfers match this search.">
              No loaded transfers match this search.
            </Trans>
          </p>
        ) : null}
        {term && transfersQuery.hasNextPage ? (
          <Button
            variant="outline"
            tap
            pending={transfersQuery.isFetchingNextPage}
            onClick={() => void transfersQuery.fetchNextPage()}
          >
            <Trans>Load more</Trans>
          </Button>
        ) : null}
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
