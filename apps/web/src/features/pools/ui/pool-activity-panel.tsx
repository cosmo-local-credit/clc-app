import type { ActivityKind } from "@clc/api/features/accounts/client";
import { ActivityFilterSheet } from "#/components/activity/activity-filter-sheet";
import type { UserPool } from "@clc/api/features/pools/client";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { getAddress, isAddress } from "viem";
import {
  RiArrowLeftDownLine,
  RiArrowLeftRightLine,
  RiArrowRightUpLine,
  RiSparkling2Line,
} from "react-icons/ri";

import { Button } from "#/components/ui/button";
import {
  formatActivityLegAmount,
  SwapActivityAmounts,
  SwapActivityTitle,
} from "#/components/activity/swap-activity";
import { EllipsizedAddress, SignedAmount } from "#/components/wallet";
import {
  type PoolActivityEntry,
  poolActivityFromAccount,
} from "#/features/pools/logic/pool-activity";
import { useAccountActivityInfinite } from "#/features/wallet/hooks/use-account-balances";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { PoolActivityDetailsSheet } from "./pool-activity-details-sheet";

/**
 * Everything that has moved through the pool.
 *
 * The pool is an ordinary account as far as the indexer is concerned, so its
 * history uses the same classified activity feed as a wallet. The backend
 * identifies operation events before pagination. Direction is relative to the
 * pool, so IN means into the pool.
 */
export function PoolActivityPanel({ pool }: { pool: UserPool }) {
  const { t } = useLingui();
  // Core validates the route address as EIP-55; indexed activity matching is
  // case-insensitive so imported and live tracker rows resolve consistently.
  const [types, setTypes] = useState<readonly ActivityKind[]>([]);
  const transfersQuery = useAccountActivityInfinite(
    isAddress(pool.address) ? getAddress(pool.address) : undefined,
    { poll: true, types },
  );
  const [selected, setSelected] = useState<PoolActivityEntry | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const transfers = transfersQuery.data?.pages.flatMap((page) => page.activity) ?? [];
  const entries = transfers.map((item) => poolActivityFromAccount(item, pool.address));

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !transfersQuery.hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver((observed) => {
      if (observed[0]?.isIntersecting && !transfersQuery.isFetchingNextPage) {
        void transfersQuery.fetchNextPage();
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [transfersQuery.fetchNextPage, transfersQuery.hasNextPage, transfersQuery.isFetchingNextPage]);

  return (
    <div
      id="pool-panel-activity"
      role="tabpanel"
      aria-labelledby="pool-tab-activity"
      className="space-y-3"
    >
      <div className="flex justify-end">
        <ActivityFilterSheet types={types} onApply={setTypes} />
      </div>
      <section className="border border-border bg-card" aria-label={t`Pool activity`}>
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
              tap
              pending={transfersQuery.isFetching}
              onClick={() => void transfersQuery.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {transfersQuery.isSuccess && entries.length === 0 ? (
          <div className="p-3 text-muted-foreground text-sm">
            {types.length > 0 ? (
              <Trans>No activity matches these filters.</Trans>
            ) : (
              <Trans>Nothing has moved through this pool yet.</Trans>
            )}
          </div>
        ) : null}
        {entries.map((entry, index, list) => (
          <ActivityRow
            key={entry.key}
            entry={entry}
            isLast={index === list.length - 1}
            onOpen={() => setSelected(entry)}
          />
        ))}
        <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
        {transfersQuery.isFetchingNextPage ? (
          <div className="p-3 text-center text-muted-foreground text-xs">
            <Trans>Loading more…</Trans>
          </div>
        ) : null}
      </section>

      <PoolActivityDetailsSheet
        poolAddress={pool.address}
        entry={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}

function ActivityRow({
  entry,
  isLast,
  onOpen,
}: {
  entry: PoolActivityEntry;
  isLast: boolean;
  onOpen: () => void;
}) {
  const date = formatTransferDate(entry.dateBlock);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "flex w-full items-center gap-2.5 p-3 text-start",
        isLast ? "" : "border-b border-border",
      ].join(" ")}
    >
      <span
        className={[
          "flex size-7 shrink-0 items-center justify-center bg-muted",
          iconTone(entry),
        ].join(" ")}
      >
        <EntryIcon entry={entry} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          <EntryTitle entry={entry} />
        </p>
        <p className="truncate text-muted-foreground text-xs">
          <EntrySubtitle entry={entry} />
          {date ? (
            <>
              <span aria-hidden="true"> · </span>
              <time dateTime={entry.dateBlock}>{date}</time>
            </>
          ) : null}
        </p>
      </div>

      <span className="shrink-0 text-end">
        <EntryAmount entry={entry} />
      </span>
    </button>
  );
}

function EntryIcon({ entry }: { entry: PoolActivityEntry }) {
  if (entry.kind === "swap") {
    return <RiArrowLeftRightLine className="size-3.5" aria-hidden="true" />;
  }
  if (entry.kind === "mint") {
    return <RiSparkling2Line className="size-3.5" aria-hidden="true" />;
  }
  const Icon = entry.direction === "IN" ? RiArrowLeftDownLine : RiArrowRightUpLine;
  return <Icon className="size-3.5" aria-hidden="true" />;
}

function iconTone(entry: PoolActivityEntry): string {
  if (entry.kind === "swap" || entry.kind === "mint") return "text-foreground";
  return entry.direction === "IN" ? "text-primary" : "text-destructive";
}

function EntryTitle({ entry }: { entry: PoolActivityEntry }) {
  if (entry.kind === "swap") {
    return <SwapActivityTitle symbols={[entry.received.tokenSymbol, entry.sent.tokenSymbol]} />;
  }
  if (entry.kind === "mint") return <Trans>Created in the pool</Trans>;
  return entry.direction === "IN" ? <Trans>Deposit</Trans> : <Trans>Pay Out</Trans>;
}

function EntrySubtitle({ entry }: { entry: PoolActivityEntry }) {
  if (entry.kind === "mint") return <Trans>New supply</Trans>;
  return (
    <>
      {entry.kind === "withdrawal" ? (
        <>
          <Trans>Withdrawal</Trans> ·{" "}
        </>
      ) : null}
      {entry.kind === "fee-withdrawal" ? (
        <>
          <Trans>Fee withdrawal</Trans> ·{" "}
        </>
      ) : null}
      {!entry.success ? (
        <>
          <Trans>Failed</Trans> ·{" "}
        </>
      ) : null}
      {entry.kind === "swap" || entry.direction === "IN" ? <Trans>From</Trans> : <Trans>To</Trans>}{" "}
      <EllipsizedAddress address={entry.counterpartyAddress} />
    </>
  );
}

/**
 * A swap shows both sides, because which voucher left the pool is half of what
 * happened; every other row has one figure and shows it alone.
 *
 * Direction is carried by the same in/out marks the send and swap receipts use,
 * rather than by a bare + and −. Those two read as arithmetic on one balance,
 * which is the wrong frame for a swap: the pool gained one voucher and gave up
 * a different one, and nothing about the pair sums.
 */
function EntryAmount({ entry }: { entry: PoolActivityEntry }) {
  const { i18n } = useLingui();
  const locale = i18n.locales?.[0] ?? i18n.locale;
  if (entry.kind !== "swap") {
    return (
      <SignedAmount
        direction={entry.kind === "mint" || entry.direction === "IN" ? "in" : "out"}
        amount={formatActivityLegAmount(entry.leg, locale)}
      />
    );
  }

  return (
    <SwapActivityAmounts
      incoming={entry.received}
      outgoing={entry.sent}
      protocolFee={entry.protocolFee ?? undefined}
      locale={locale}
      incomingFirst
    />
  );
}
