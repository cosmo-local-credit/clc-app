import type { UserPool } from "@clc/api/features/pools/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";
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
import { EllipsizedAddress, SignedAmount } from "#/components/wallet";
import {
  type PoolActivityEntry,
  type PoolActivityLeg,
  buildPoolActivity,
} from "#/features/pools/logic/pool-activity";
import { useAccountTransfersInfinite } from "#/features/wallet/hooks/use-account-balances";
import { formatTransferDate } from "#/features/wallet/logic/transfer-display";
import { PoolActivityDetailsSheet } from "./pool-activity-details-sheet";

/**
 * Everything that has moved through the pool.
 *
 * The pool is an ordinary account as far as the indexer is concerned, so its
 * history is the same `/accounts/:address/transfers` feed a wallet reads — the
 * one endpoint that exposes swap legs without a superadmin session. `direction`
 * comes back relative to the address queried, so IN means into the pool.
 */
export function PoolActivityPanel({ pool }: { pool: UserPool }) {
  const { t } = useLingui();
  // clc-core validates this path parameter as `eth_addr_checksum` and the
  // indexer stores EIP-55 addresses, so a lowercased one is rejected outright
  // and a mixed-case one matches nothing.
  const transfersQuery = useAccountTransfersInfinite(
    isAddress(pool.address) ? getAddress(pool.address) : undefined,
    { poll: true },
  );
  const [selected, setSelected] = useState<PoolActivityEntry | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const transfers = transfersQuery.data?.pages.flatMap((page) => page.transfers) ?? [];
  const entries = buildPoolActivity(transfers);

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
              size="sm"
              className="h-9 bg-card"
              onClick={() => transfersQuery.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          </div>
        ) : null}
        {transfersQuery.isSuccess && entries.length === 0 ? (
          <div className="p-3 text-muted-foreground text-sm">
            <Trans>Nothing has moved through this pool yet.</Trans>
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
        <p className="truncate text-muted-foreground text-[0.6875rem]">
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
    return (
      <Trans>
        Swapped {entry.received.tokenSymbol} for {entry.sent.tokenSymbol}
      </Trans>
    );
  }
  if (entry.kind === "mint") return <Trans>Created in the pool</Trans>;
  // A deposit is the only inbound transfer a pool takes; outbound covers a fee
  // sweep and a liquidity withdrawal, which the chain does not tell apart.
  return entry.direction === "IN" ? <Trans>Deposit</Trans> : <Trans>Paid out</Trans>;
}

function EntrySubtitle({ entry }: { entry: PoolActivityEntry }) {
  if (entry.kind === "mint") return <Trans>New supply</Trans>;
  return (
    <>
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
  if (entry.kind !== "swap") {
    return (
      <SignedAmount
        direction={entry.kind === "mint" || entry.direction === "IN" ? "in" : "out"}
        amount={legAmount(entry.leg)}
      />
    );
  }

  return (
    <>
      {/* `flex justify-end` rather than `block`: SignedAmount is an inline-flex
          row of icon and figure, so stacking the two sides has to keep the flex
          box and change only how it fills the line. */}
      <SignedAmount
        direction="in"
        amount={legAmount(entry.received)}
        className="flex justify-end"
      />
      <SignedAmount direction="out" amount={legAmount(entry.sent)} className="flex justify-end" />
      {entry.protocolFee ? (
        // Shown apart from the trader's side: it left the pool in the same
        // transaction but went to the protocol, not to whoever swapped.
        <span className="block font-mono text-muted-foreground text-[0.625rem] tabular-nums">
          <Trans>fee</Trans> {legAmount(entry.protocolFee)}
        </span>
      ) : null}
    </>
  );
}

function legAmount(leg: PoolActivityLeg): string {
  return `${formatTokenAmount(leg.amount, leg.tokenDecimals)} ${leg.tokenSymbol}`;
}
