import type { AccountActivityItem, ActivityKind } from "@clc/api/features/accounts/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import {
  RiArrowLeftDownLine,
  RiArrowLeftRightLine,
  RiArrowRightUpLine,
  RiChat1Line,
  RiCloseLine,
  RiSearchLine,
  RiUserLine,
  RiSparkling2Line,
} from "react-icons/ri";

import { AccountSwapDetailsSheet } from "#/components/activity/account-swap-details-sheet";
import { ActivityFilterSheet } from "#/components/activity/activity-filter-sheet";
import { SwapActivityAmounts, SwapActivityTitle } from "#/components/activity/swap-activity";
import { MarketFeedBar } from "#/components/market-bar";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { ListSkeleton } from "#/components/ui/list-skeleton";
import { TransferDetailsSheet, type TransferDetails } from "#/components/wallet";
import { RecipientIdentityLabel } from "#/components/wallet/recipient-identity-label";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import {
  formatTransferDate,
  formatTransferUnitValue,
} from "#/features/wallet/logic/transfer-display";
import { useDebouncedValue } from "#/lib/use-debounced-value";

export function ActivityPage({
  address,
  query = "",
  types = [],
  onQueryChange,
  onTypesChange,
}: {
  address?: string;
  query?: string;
  types?: readonly ActivityKind[];
  onQueryChange?: (query: string) => void;
  onTypesChange?: (types: readonly ActivityKind[]) => void;
}) {
  const { i18n, t } = useLingui();
  const [draftQuery, setDraftQuery] = useState(query);
  const term = draftQuery.trim().replace(/\s+/gu, " ");
  const { settled, isPending: isDebouncing } = useDebouncedValue(term);
  const tooShort = term !== "" && Array.from(term).length < 2;
  const searchReady = !isDebouncing && !tooShort;
  const activityQuery = useAccountActivityInfinite(address, {
    poll: settled === "" && types.length === 0,
    q: settled,
    types,
    enabled: searchReady,
  });
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetails | null>(null);
  const [selectedSwap, setSelectedSwap] = useState<Extract<
    AccountActivityItem,
    { kind: "swapped" }
  > | null>(null);
  const activity = activityQuery.data?.pages.flatMap((page) => page.activity) ?? [];

  useEffect(() => setDraftQuery(query), [query]);
  useEffect(() => {
    if (!isDebouncing && settled !== query) onQueryChange?.(settled);
  }, [isDebouncing, onQueryChange, query, settled]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (
      !searchReady ||
      !target ||
      !activityQuery.hasNextPage ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !activityQuery.isFetchingNextPage) {
        void activityQuery.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    searchReady,
    activityQuery.fetchNextPage,
    activityQuery.hasNextPage,
    activityQuery.isFetchingNextPage,
  ]);

  const isFiltered = settled !== "" || types.length > 0;

  return (
    <div className="space-y-3">
      <h1 className="sr-only">{t`Activity`}</h1>
      <MarketFeedBar
        current="activity"
        search={
          <div className="relative h-full min-w-0 flex-1">
            <RiSearchLine
              className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              maxLength={66}
              aria-describedby="activity-search-help"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              aria-label={t`Search activity`}
              placeholder={t`Search activity`}
              className="h-full appearance-none border-0 bg-card ps-9 pe-11 focus-visible:border-transparent [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
            />
            {draftQuery ? (
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={() => setDraftQuery("")}
                aria-label={t`Clear search`}
                className="absolute top-1/2 end-0 -translate-y-1/2 border-0 bg-card text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:border-transparent"
              >
                <RiCloseLine className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        }
        filters={<ActivityFilterSheet types={types} onApply={(next) => onTypesChange?.(next)} />}
      />
      <p id="activity-search-help" className="text-sm text-muted-foreground">
        {tooShort ? (
          <Trans>Type at least two characters.</Trans>
        ) : (
          <Trans>Search by voucher name, symbol, address or transaction hash.</Trans>
        )}
      </p>
      <section
        className="border border-border bg-card"
        aria-label={t`Activity`}
        aria-busy={isDebouncing || activityQuery.isFetching}
      >
        <div role="status" aria-live="polite" aria-atomic="true">
          {searchReady && activityQuery.isSuccess && activity.length > 0 ? (
            <span className="sr-only">
              <Plural
                value={activity.length}
                one="# activity item shown."
                other="# activity items shown."
              />
            </span>
          ) : null}
          {searchReady && activityQuery.isSuccess && activity.length === 0 ? (
            <div className="space-y-2 p-3">
              <p className="text-muted-foreground text-sm">
                {isFiltered ? (
                  <Trans>No activity matches these filters.</Trans>
                ) : (
                  <Trans>No activity yet.</Trans>
                )}
              </p>
              {isFiltered ? (
                <Button
                  variant="outline"
                  tap
                  onClick={() => {
                    setDraftQuery("");
                    onQueryChange?.("");
                    onTypesChange?.([]);
                  }}
                >
                  <Trans>Clear filters</Trans>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {searchReady ? (
          <>
            {activityQuery.isPending ? (
              <ListSkeleton framed={false} label={<Trans>Loading activity…</Trans>} />
            ) : null}
            {activityQuery.isError ? (
              <div className="space-y-2 p-3">
                <p role="alert" className="text-muted-foreground text-sm">
                  <Trans>Couldn't load activity.</Trans>
                </p>
                <Button
                  variant="outline"
                  tap
                  pending={activityQuery.isFetching}
                  onClick={() => void activityQuery.refetch()}
                >
                  <Trans>Try again</Trans>
                </Button>
              </div>
            ) : null}
            {activity.map((item, index) => (
              <ActivityRow
                key={`${item.txHash}-${item.id}`}
                item={item}
                isLast={index === activity.length - 1}
                locale={i18n.locales?.[0] ?? i18n.locale}
                onOpen={() => {
                  if (item.kind === "swapped") setSelectedSwap(item);
                  else setSelectedTransfer(toTransferDetails(item));
                }}
              />
            ))}
            <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
            {activityQuery.isFetchingNextPage ? (
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
      <AccountSwapDetailsSheet
        activity={selectedSwap}
        open={selectedSwap !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSwap(null);
        }}
      />
    </div>
  );
}

function ActivityRow({
  item,
  isLast,
  locale,
  onOpen,
}: {
  item: AccountActivityItem;
  isLast: boolean;
  locale: string;
  onOpen: () => void;
}) {
  if (item.kind === "swapped") {
    const date = formatTransferDate(item.dateBlock);
    return (
      <button
        type="button"
        className={`flex w-full items-center gap-2.5 p-3 text-start ${isLast ? "" : "border-b border-border"}`}
        onClick={onOpen}
      >
        <span className="flex size-7 shrink-0 items-center justify-center bg-muted text-foreground">
          <RiArrowLeftRightLine className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <SwapActivityTitle symbols={[item.received.tokenSymbol, item.sent.tokenSymbol]} />
          </p>
          <p className="truncate text-muted-foreground text-xs">
            <Trans>Pool</Trans> {item.poolAddresses[0] ?? "—"}
            {date ? (
              <>
                <span aria-hidden="true"> · </span>
                <time dateTime={item.dateBlock}>{date}</time>
              </>
            ) : null}
          </p>
        </div>
        <span className="shrink-0 text-end">
          <SwapActivityAmounts
            outgoing={item.sent}
            incoming={item.received}
            protocolFee={item.protocolFee}
            locale={locale}
            incomingFirst
          />
        </span>
      </button>
    );
  }

  const incoming = item.direction ? item.direction === "IN" : item.kind !== "sent";
  const created = item.kind === "creation";
  const neutral = item.direction === "NONE";
  const Icon = created
    ? RiSparkling2Line
    : neutral
      ? RiUserLine
      : incoming
        ? RiArrowLeftDownLine
        : RiArrowRightUpLine;
  const transferDate = formatTransferDate(item.dateBlock);
  const uoaLabel = formatTransferUnitValue(item.transfer.uoaValue, item.transfer.uoa, locale);
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2.5 p-3 text-start ${isLast ? "" : "border-b border-border"}`}
      onClick={onOpen}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center bg-muted ${created || neutral ? "text-foreground" : incoming ? "text-primary" : "text-destructive"}`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {item.kind === "deposited" ? (
            <Trans>Deposit</Trans>
          ) : item.kind === "withdrawn" ||
            item.kind === "fee_withdrawn" ||
            item.kind === "pool_payout" ? (
            <Trans>Pay Out</Trans>
          ) : created ? (
            <Trans>Created</Trans>
          ) : incoming ? (
            <Trans>Received</Trans>
          ) : (
            <Trans>Sent</Trans>
          )}
          {item.hasNote ? (
            <>
              <RiChat1Line className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">
                <Trans>Has a message</Trans>
              </span>
            </>
          ) : null}
        </p>
        <p className="min-w-0 text-muted-foreground text-xs">
          <span className="block truncate">
            {item.kind === "withdrawn" ? (
              <>
                <Trans>Withdrawal</Trans> ·{" "}
              </>
            ) : null}
            {item.kind === "fee_withdrawn" ? (
              <>
                <Trans>Fee withdrawal</Trans> ·{" "}
              </>
            ) : null}
            {created ? (
              <Trans>New supply</Trans>
            ) : (
              <>
                {incoming ? <Trans>From</Trans> : <Trans>To</Trans>}{" "}
                {item.poolName &&
                (incoming ? item.senderAddress : item.recipientAddress).toLowerCase() ===
                  item.poolAddresses?.[0]?.toLowerCase() ? (
                  item.poolName
                ) : (
                  <RecipientIdentityLabel address={item.counterpartyAddress} />
                )}
              </>
            )}
          </span>
          {transferDate ? (
            <span className="block">
              <time dateTime={item.dateBlock}>{transferDate}</time>
            </span>
          ) : null}
        </p>
        {neutral ? (
          <p className="text-muted-foreground text-xs">
            <Trans>No balance change</Trans>
          </p>
        ) : null}
      </div>
      <span className="shrink-0 text-end font-mono text-xs font-semibold">
        <span className="block">
          {formatTokenAmount(item.transfer.amount, item.transfer.tokenDecimals)}{" "}
          {item.transfer.tokenSymbol}
        </span>
        {uoaLabel ? <span className="block text-muted-foreground">({uoaLabel})</span> : null}
        {!item.success ? (
          <span className="block text-muted-foreground">
            <Trans>Failed</Trans>
          </span>
        ) : null}
      </span>
    </button>
  );
}

function toTransferDetails(
  item: Exclude<AccountActivityItem, { kind: "swapped" }>,
): TransferDetails {
  return {
    activityKind:
      item.kind === "deposited" ||
      item.kind === "withdrawn" ||
      item.kind === "fee_withdrawn" ||
      item.kind === "pool_payout"
        ? item.kind
        : undefined,
    initiatorAddress: item.initiatorAddress,
    nominalAmount: item.nominalAmount,
    txHash: item.txHash,
    dateBlock: item.dateBlock,
    direction: item.direction ?? (item.kind === "sent" ? "OUT" : "IN"),
    senderAddress: item.senderAddress,
    recipientAddress: item.recipientAddress,
    ...item.transfer,
    success: item.success,
  };
}
