import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
import type { PoolOfferPoint } from "../pool-posture";

const config = {
  available: { label: "Live", color: "var(--chart-1)" },
  unavailable: { label: "Dormant", color: "var(--chart-4)" },
} satisfies ChartConfig;

/**
 * What is actually for sale in the pool, by voucher.
 *
 * Everything else on this screen describes how the pool is set up. This says
 * whether anyone is using it, and where — a pool can be fully registered, capped
 * and priced with nothing offered against a single one of its vouchers.
 *
 * Stacked rather than grouped: the pair is a whole and its parts, and the total
 * bar length is the comparison an operator makes first.
 */
export function PoolOffersChart({ offers, state }: { offers: PoolOfferPoint[]; state: DataState }) {
  return (
    <section aria-label="Pool offers" className="border-border bg-card border p-3">
      <SectionLabel className="mb-2">Offers by voucher</SectionLabel>

      {state.kind === "pending" ? (
        <p className="text-muted-foreground py-8 text-sm">Loading…</p>
      ) : state.kind === "error" ? (
        <p className="text-muted-foreground py-8 text-sm">Could not load offers.</p>
      ) : offers.length === 0 ? (
        <p className="text-muted-foreground py-8 text-sm">
          Nothing is offered against this pool's vouchers.
        </p>
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto h-36 w-full"
          initialDimension={{ width: 280, height: 144 }}
        >
          <BarChart
            accessibilityLayer
            data={offers}
            margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="symbol"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              interval={0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="available" stackId="offers" fill="var(--color-available)" />
            <Bar dataKey="unavailable" stackId="offers" fill="var(--color-unavailable)" />
          </BarChart>
        </ChartContainer>
      )}
    </section>
  );
}
