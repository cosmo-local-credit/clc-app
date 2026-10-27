import {
  adminPoolQueryOptions,
  adminPoolTransactionsQueryOptions,
} from "@clc/api/features/admin/queries";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { LoadingBlock } from "#/components/admin/loading-block";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { clcApi } from "#/lib/api";
import { errorMessage, isFigureAvailable } from "#/lib/data-state";
import { useDataState } from "#/lib/use-data-state";
import { usePoolPricing } from "./use-pool-pricing";
import type { PoolDetailSearch } from "./pool-detail-search";
import {
  poolActivitySeries,
  poolAdvisories,
  poolComposition,
  poolOfferSeries,
} from "./pool-posture";
import { PoolRecordTabs } from "./pool-record-tabs";
import type { PoolVoucherEdit } from "./ui/pool-holdings-panel";
import { AddPoolVoucherSheet } from "./ui/add-pool-voucher-sheet";
import { EditPoolProfileSheet } from "./ui/edit-pool-profile-sheet";
import { PoolActivityChart } from "./ui/pool-activity-chart";
import { PoolAdvisories } from "./ui/pool-advisories";
import { PoolControlsSheet } from "./ui/pool-controls-sheet";
import { PoolHeader } from "./ui/pool-header";
import { PoolOffersChart } from "./ui/pool-offers-chart";
import { PoolProfileCard } from "./ui/pool-profile-card";
import { PoolSummaryMetrics } from "./ui/pool-summary-metrics";
import { type SettlingVoucher, settlingVoucher, usePoolVouchers } from "./use-pool-vouchers";
import { RestoreResourceSheet } from "#/features/retirement/restore-resource-sheet";
import { RetirementResourceHistory } from "#/features/retirement/retirement-resource-history";

/**
 * The largest page clc-core serves. The chart buckets over it because there is
 * no per-pool time series endpoint, so a bigger page is a longer honest window.
 */
const ACTIVITY_PAGE_SIZE = 100;

/**
 * One pool, as an operator reads it: what is wrong with it first, then what it
 * is, then what it has been doing, then its records.
 *
 * Query orchestration stays here and the panels take data as props, matching the
 * account screen: the voucher page feeds the summary tiles, the advisories, the
 * vouchers table and the feed grouping, and fetching it once means those four
 * can never disagree about what the pool contains.
 *
 * Dependency addresses come from the catalog and are shown as unrecorded when
 * absent rather than guessed at — on SwapPool an unset pointer changes
 * behaviour rather than disabling it, and inventing one would be the worse error.
 */
export function PoolDetailPage({ address, search }: { address: string; search: PoolDetailSearch }) {
  const poolQuery = useQuery(adminPoolQueryOptions(clcApi.admin, address));
  const [restoring, setRestoring] = useState(false);

  // Set when a voucher has been signed for but not yet projected into the
  // catalog; it makes the voucher read poll until the row lands. See
  // use-pool-vouchers.ts for why that lag exists at all.
  const [settling, setSettling] = useState<SettlingVoucher | null>(null);
  const [addingVoucher, setAddingVoucher] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<PoolVoucherEdit | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  const vouchersQuery = usePoolVouchers(address, settling);
  const activityQuery = useQuery(
    adminPoolTransactionsQueryOptions(clcApi.admin, {
      perPage: ACTIVITY_PAGE_SIZE,
      pool: address,
    }),
  );

  const pricing = usePoolPricing(poolQuery.data);
  const poolState = useDataState(poolQuery, () => false);
  const vouchersState = useDataState(vouchersQuery, (page) => page.vouchers.length === 0);
  const activityState = useDataState(activityQuery, () => false);

  if (poolState.kind === "pending") return <LoadingBlock rows={8} />;

  const pool = poolQuery.data ? { ...poolQuery.data, quoterType: pricing } : undefined;
  if (!pool) {
    return (
      <PageState
        title="Could not load pool"
        message={poolState.kind === "error" ? poolState.message : errorMessage(poolQuery.error)}
      />
    );
  }

  const vouchers = vouchersQuery.data?.vouchers ?? [];
  // False while the voucher page is in flight or after it failed, which turns
  // every count derived from it into "unavailable" instead of a confident zero.
  const vouchersAvailable = isFigureAvailable(vouchersState);
  const composition = poolComposition(pool, vouchers, vouchersQuery.data?.total);
  const activity = poolActivitySeries(
    activityQuery.data?.transactions ?? [],
    {
      receivedCount: activityQuery.data?.receivedCount ?? 0,
      perPage: ACTIVITY_PAGE_SIZE,
    },
    new Date(),
  );

  return (
    <div className="flex flex-col gap-6">
      {poolState.kind === "stale" ? <StaleNotice message={poolState.message} /> : null}

      <PoolHeader
        pool={pool}
        onAddVoucher={() => setAddingVoucher(true)}
        onEditProfile={() => setEditingProfile(true)}
        onControls={() => setControlsOpen(true)}
        onRestore={() => setRestoring(true)}
      />

      <PoolAdvisories advisories={poolAdvisories(pool, composition, { vouchersAvailable })} />

      {pool.active === false ? (
        <p role="status" className="border-border bg-muted/30 border p-4 text-sm">
          This pool is retired in CLC. New swaps and deposits are disabled. Owner withdrawals,
          balances and history remain available.
        </p>
      ) : null}

      <RetirementResourceHistory type="pool" address={address} />
      <RestoreResourceSheet
        type="pool"
        address={address}
        name={pool.name}
        open={restoring}
        onClose={() => setRestoring(false)}
      />

      {/* Two columns, split by how each half is read. The left is the record —
          profile, fees, dependencies — reference an operator reads once and
          returns to only when something is wrong. The right is everything looked
          at rather than read: the figures, the two charts and the map. Keeping
          the visuals together is what lets them be big enough to mean anything;
          the map in particular was unusable at a third of a definition list's
          width. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <PoolProfileCard pool={pool} />

        {/* A grid, not a stack. Stacked, these ran to twice the height of the
            record beside them and pushed the records tab off the screen; side by
            side the two charts cost one row between them. */}
        <div className="grid auto-rows-min gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PoolSummaryMetrics
              composition={composition}
              feePpm={pool.feePpm}
              available={vouchersAvailable}
            />
          </div>
          <PoolActivityChart activity={activity} state={activityState} />
          <PoolOffersChart offers={poolOfferSeries(vouchers)} state={vouchersState} />
        </div>
      </div>

      <PoolRecordTabs
        pool={pool}
        vouchers={vouchers}
        vouchersState={vouchersState}
        settling={settling}
        search={search}
        onConfigure={setEditingVoucher}
      />

      {/* The fetched page is handed over rather than refetched: the picker has to
          exclude vouchers the pool already allows, and re-registering one reverts
          the whole batch. */}
      <AddPoolVoucherSheet
        key={`${pool.address}:${pool.quoterType}`}
        pool={pool}
        poolVouchers={vouchers}
        open={addingVoucher}
        onClose={() => setAddingVoucher(false)}
        onAdded={(tokenAddress) => setSettling(settlingVoucher(tokenAddress))}
      />

      {editingVoucher ? (
        <AddPoolVoucherSheet
          key={editingVoucher.voucher.tokenAddress}
          pool={pool}
          poolVouchers={vouchers}
          edit={editingVoucher}
          open
          onClose={() => setEditingVoucher(null)}
          onAdded={() => {}}
          onUpdated={(expected) =>
            setSettling(settlingVoucher(editingVoucher.voucher.tokenAddress, expected))
          }
        />
      ) : null}

      <EditPoolProfileSheet
        pool={pool}
        open={editingProfile}
        onClose={() => setEditingProfile(false)}
      />

      <PoolControlsSheet
        pool={pool}
        vouchers={vouchers}
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
      />
    </div>
  );
}
