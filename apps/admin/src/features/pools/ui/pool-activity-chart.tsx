import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { SectionLabel } from "#/components/admin/section-heading";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "#/components/ui/chart";
import type { DataState } from "#/lib/data-state";
import { formatSeriesTick, formatSeriesTooltip } from "#/lib/time-range";
import { POOL_ACTIVITY_DAYS, type PoolActivity } from "../pool-posture";

const DAY_BUCKET = "24h";

const config = {
  swaps: { label: "Swaps", color: "var(--chart-1)" },
  deposits: { label: "Deposits", color: "var(--chart-2)" },
} satisfies ChartConfig;

/**
 * A week of the pool's indexed activity, the one thing on this screen that says
 * whether it is being used rather than how it is configured.
 *
 * Two lines rather than one total: a pool taking deposits but settling no swaps
 * is a different situation from one doing both, and a combined count hides the
 * difference at exactly the moment an operator would want it.
 *
 * The counts are bucketed from one page of transactions because clc-core serves
 * no per-pool series. When that page does not reach back a full week the chart
 * says so instead of drawing short days as quiet ones — the shape would
 * otherwise read as declining activity when it is only a page boundary.
 */
export function PoolActivityChart({
  activity,
  state,
}: {
  activity: PoolActivity;
  state: DataState;
}) {
  const empty = activity.points.every((point) => point.swaps === 0 && point.deposits === 0);

  return (
    <section aria-label="Pool activity" className="border-border bg-card border p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <SectionLabel>Activity</SectionLabel>
        <span className="text-muted-foreground font-mono text-xs">{POOL_ACTIVITY_DAYS}d</span>
      </div>

      {state.kind === "pending" ? (
        <p className="text-muted-foreground py-8 text-sm">Loading…</p>
      ) : state.kind === "error" ? (
        <p className="text-muted-foreground py-8 text-sm">Could not load activity.</p>
      ) : empty ? (
        <p className="text-muted-foreground py-8 text-sm">No swap or deposit indexed this week.</p>
      ) : (
        <>
          <ChartContainer
            config={config}
            className="aspect-auto h-36 w-full"
            initialDimension={{ width: 280, height: 144 }}
          >
            <LineChart
              accessibilityLayer
              data={activity.points}
              margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                tickLine={false}
                axisLine={false}
                minTickGap={16}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => formatSeriesTick(String(value), DAY_BUCKET)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatSeriesTooltip(String(value), DAY_BUCKET)}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="swaps"
                type="monotone"
                stroke="var(--color-swaps)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="deposits"
                type="monotone"
                stroke="var(--color-deposits)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>

          {activity.complete ? null : (
            <p className="text-muted-foreground mt-2 text-xs">
              Counted from the most recent page of transactions, which does not reach back a full
              week. Earlier days are undercounted.
            </p>
          )}
        </>
      )}
    </section>
  );
}
