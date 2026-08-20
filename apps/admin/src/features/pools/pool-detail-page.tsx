import { adminPoolTransactionsQueryOptions } from "@clc/api/features/admin/queries";
import { poolQueryOptions } from "@clc/api/features/pools/queries";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { LoadingBlock } from "#/components/admin/loading-block";
import { PageState } from "#/components/admin/page-state";
import { StaleNotice } from "#/components/admin/stale-notice";
import { clcApi } from "#/lib/api";
import { errorMessage, isFigureAvailable } from "#/lib/data-state";
import { useDataState } from "#/lib/use-data-state";
import type { PoolDetailSearch } from "./pool-detail-search";
import {
  poolActivitySeries,
  poolAdvisories,
  poolComposition,
  poolOfferSeries,
} from "./pool-posture";
import { PoolRecordTabs } from "./pool-record-tabs";
import { AddPoolVoucherSheet } from "./ui/add-pool-voucher-sheet";
import { EditPoolProfileSheet } from "./ui/edit-pool-profile-sheet";
import { PoolActivityChart } from "./ui/pool-activity-chart";
import { PoolAdvisories } from "./ui/pool-advisories";
import { PoolHeader } from "./ui/pool-header";
import { PoolOffersChart } from "./ui/pool-offers-chart";
import { PoolProfileCard } from "./ui/pool-profile-card";
import { PoolSummaryMetrics } from "./ui/pool-summary-metrics";
import { type SettlingVoucher, settlingVoucher, usePoolVouchers } from "./use-pool-vouchers";

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
 * Everything on this screen is the catalog's view of the pool. The console holds
 * no chain client, so a dependency address that clc-core never recorded is shown
 * as unrecorded rather than guessed at — on SwapPool an unset pointer changes
 * behaviour rather than disabling it, and inventing one would be the worse error.
 */
export function PoolDetailPage({ address, search }: { address: string; search: PoolDetailSearch }) {
  const poolQuery = useQuery(poolQueryOptions(clcApi.pools, address));

  // Set when a voucher has been signed for but not yet projected into the
  // catalog; it makes the voucher read poll until the row lands. See
  // use-pool-vouchers.ts for why that lag exists at all.
  const [settling, setSettling] = useState<SettlingVoucher | null>(null);
  const [addingVoucher, setAddingVoucher] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const vouchersQuery = usePoolVouchers(address, settling);
  const activityQuery = useQuery(
    adminPoolTransactionsQueryOptions(clcApi.admin, {
      perPage: ACTIVITY_PAGE_SIZE,
      pool: address,
    }),
  );

  const poolState = useDataState(poolQuery, () => false);
  const vouchersState = useDataState(vouchersQuery, (page) => page.vouchers.length === 0);
  const activityState = useDataState(activityQuery, () => false);

  if (poolState.kind === "pending") return <LoadingBlock rows={8} />;

  const pool = poolQuery.data;
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
  const composition = poolComposition(pool, vouchers);
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
      />

      <PoolAdvisories advisories={poolAdvisories(pool, composition, { vouchersAvailable })} />

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
      />

      {/* The fetched page is handed over rather than refetched: the picker has to
          exclude vouchers the pool already allows, and re-registering one reverts
          the whole batch. */}
      <AddPoolVoucherSheet
        pool={pool}
        poolVouchers={vouchers}
        open={addingVoucher}
        onClose={() => setAddingVoucher(false)}
        onAdded={(tokenAddress) => setSettling(settlingVoucher(tokenAddress))}
      />

      <EditPoolProfileSheet
        pool={pool}
        open={editingProfile}
        onClose={() => setEditingProfile(false)}
      />
    </div>
  );
}
