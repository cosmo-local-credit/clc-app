import type { AdminAccountStats } from "@clc/api/features/admin/client";

import { MetricCard } from "#/components/admin/metric-card";

/**
 * Six figures about the account, at detail-screen density.
 *
 * These sit in a column beside the profile and balances rather than in a band of
 * their own, so they are the compact tile: an operator scans them while reading
 * the account.
 *
 * `stats` is null while the request is in flight or after it failed, and the three
 * chain figures inside it are null when clc-core cannot reach the federation
 * database. Both cases render as unavailable rather than as zero — a wrong number
 * an operator trusts is worse than no number.
 */
export function AccountSummaryMetrics({ stats }: { stats: AdminAccountStats | null }) {
  return (
    // A named region: a screen reader user tabbing through a long detail screen
    // can jump to the figures without reading the profile again.
    <section
      aria-label="Account summary"
      className="grid h-full grid-cols-2 grid-rows-3 gap-3 sm:grid-cols-3 sm:grid-rows-2 xl:grid-cols-2 xl:grid-rows-3"
    >
      <Tile label="Transactions" value={stats?.transactions ?? null} />
      <Tile label="Swaps" value={stats?.swaps ?? null} />
      <Tile label="Voucher holdings" value={stats?.vouchers ?? null} />
      <Tile label="Partners" value={stats?.partners ?? null} />
      <Tile label="Reports" value={stats?.reports ?? null} />
      <Tile label="Pool memberships" value={stats?.poolMemberships ?? null} />
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number | null }) {
  return <MetricCard label={label} size="sm" value={value ?? 0} unavailable={value === null} />;
}
