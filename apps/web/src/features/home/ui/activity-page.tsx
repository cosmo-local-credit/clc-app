import { useDebouncedValue } from "#/lib/use-debounced-value";
import { MarketFeedBar } from "#/components/market-bar";
import { Input } from "#/components/ui/input";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { formatTokenAmount, isVoucherCreationTransfer } from "@clc/core/features/wallet/logic";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
  const [query, setQuery] = useState("");
  const term = query.trim().replace(/\s+/gu, " ");
  const { settled, isPending: isDebouncing } = useDebouncedValue(term);
  const tooShort = term !== "" && Array.from(term).length < 2;
  const searchReady = !isDebouncing && !tooShort;
  const transfersQuery = useAccountTransfersInfinite(address, {
    poll: settled === "",
    q: settled,
    enabled: searchReady,
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const transfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];
  const count = transfers.length;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !searchReady ||
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
    searchReady,
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
          maxLength={66}
          aria-describedby="activity-search-help"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t`Search activity`}
          placeholder={t`Search activity`}
        />
      </MarketFeedBar>
      <p id="activity-search-help" className="text-sm text-muted-foreground">
        {tooShort ? (
          <Trans>Type at least two characters.</Trans>
        ) : (
          <Trans>Search by voucher name, symbol, address or transaction hash.</Trans>
        )}
      </p>
      <section
        className="border border-border bg-card"
        aria-label={t`Transfer history`}
        aria-busy={isDebouncing || transfersQuery.isFetching}
      >
        <div role="status" aria-live="polite" aria-atomic="true">
          {searchReady && transfersQuery.isSuccess && transfers.length > 0 ? (
            <span className="sr-only">
              <Plural value={count} one="# transfer shown." other="# transfers shown." />
            </span>
          ) : null}
          {searchReady && transfersQuery.isSuccess && transfers.length === 0 ? (
            <p className="p-3 text-muted-foreground text-sm">
              {term ? (
                <Trans>No activity matches this search.</Trans>
              ) : (
                <Trans>No activity yet.</Trans>
              )}
            </p>
          ) : null}
        </div>
        {searchReady ? (
          <>
            {transfersQuery.isPending ? (
              <ListSkeleton framed={false} label={<Trans>Loading activity…</Trans>} />
            ) : null}
            {transfersQuery.isError ? (
              <div className="space-y-2 p-3">
                <p role="alert" className="text-muted-foreground text-sm">
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
            {transfers.map((transfer, index, list) => {
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
            <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
            {transfersQuery.isFetchingNextPage ? (
              <div className="p-3 text-center text-muted-foreground text-xs">
                <Trans>Loading more…</Trans>
              </div>
            ) : null}
          </>
        ) : isDebouncing ? (
          <ListSkeleton framed={false} label={<Trans>Loading activity…</Trans>} />
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
