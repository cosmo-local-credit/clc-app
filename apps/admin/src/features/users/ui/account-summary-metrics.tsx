import type { AdminAccountStats } from "@clc/api/features/admin/client";

import { MetricCard } from "#/components/admin/metric-card";

/**
 * Six figures about the account, in one strip across the screen.
 *
 * Six across at the widest width, the same shape the dashboard's row uses, so the
 * console has one way of presenting a row of figures. Below that it steps to three
 * and then two rather than shrinking the tiles: "Pool memberships" has to fit its
 * label.
 *
 * Ordered by where the number comes from, not by importance. The first three are
 * the federation database's and go null together when clc-core cannot reach it;
 * the last three are the catalog's and are always answerable. Interleaved, an
 * outage rendered as a checkerboard of dashes that reads like six unrelated
 * failures — grouped, it reads as the one thing it is.
 *
 * `stats` is null while the request is in flight or after it failed, and the three
 * chain figures inside it are null when that database is unreachable. Both cases
 * render as unavailable rather than as zero — a wrong number an operator trusts is
 * worse than no number.
 */
export function AccountSummaryMetrics({ stats }: { stats: AdminAccountStats | null }) {
  return (
    // A named region: a screen reader user tabbing through a long detail screen
    // can jump to the figures without reading the profile again.
    <section
      aria-label="Account summary"
      className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
    >
      <Tile label="Transactions" value={stats?.transactions ?? null} />
      <Tile label="Swaps" value={stats?.swaps ?? null} />
      <Tile label="Partners" value={stats?.partners ?? null} />
      <Tile label="Voucher holdings" value={stats?.vouchers ?? null} />
      <Tile label="Reports" value={stats?.reports ?? null} />
      <Tile label="Pool memberships" value={stats?.poolMemberships ?? null} />
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number | null }) {
  return <MetricCard label={label} size="sm" value={value ?? 0} unavailable={value === null} />;
}
