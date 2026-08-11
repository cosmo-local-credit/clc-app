import { clcQueries } from "@clc/api/queries";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  HiOutlineCollection,
  HiOutlineDocumentText,
  HiOutlineTicket,
  HiOutlineUsers,
} from "react-icons/hi";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyState } from "#/components/admin/empty-state";
import { MetricGridSkeleton } from "#/components/admin/loading-block";
import { MetricCard } from "#/components/admin/metric-card";
import { PageHeader } from "#/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "#/components/ui/chart";
import { useKnownOperators } from "#/features/users/use-known-operators";

const PAGE_SIZE = 100;

const kindChartConfig = {
  count: { label: "Vouchers", color: "var(--chart-1)" },
} satisfies ChartConfig;

const tagChartConfig = {
  count: { label: "Pools", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function OverviewPage() {
  const poolsQuery = useQuery(clcQueries.poolList(PAGE_SIZE));
  const vouchersQuery = useQuery(clcQueries.voucherList(PAGE_SIZE));
  const reportsQuery = useQuery(clcQueries.reportList(PAGE_SIZE));
  const { operators } = useKnownOperators();

  const pools = poolsQuery.data?.pools ?? [];
  const vouchers = vouchersQuery.data?.vouchers ?? [];
  const reports = reportsQuery.data?.reports ?? [];

  const loading = poolsQuery.isPending || vouchersQuery.isPending || reportsQuery.isPending;

  // The market voucher endpoint requires valid coordinates and drops rows
  // without them, so a page can arrive with fewer vouchers than it received.
  // Surface that gap rather than silently under-reporting a total.
  const droppedVouchers = (vouchersQuery.data?.receivedCount ?? 0) - vouchers.length;

  const kindCounts = countBy(vouchers, (voucher) => voucher.kind);
  const tagCounts = countBy(
    pools.flatMap((pool) => pool.tags),
    (tag) => tag,
  ).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Pools, vouchers and operators currently visible to the backend."
      />

      {droppedVouchers > 0 ? (
        <Alert>
          <AlertTitle>
            {droppedVouchers} voucher{droppedVouchers === 1 ? "" : "s"} not counted
          </AlertTitle>
          <AlertDescription>
            The catalog endpoint omits vouchers without valid coordinates. Totals below cover only
            geolocated vouchers.
          </AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <MetricGridSkeleton count={4} />
      ) : (
        <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Pools"
            value={pools.length}
            icon={<HiOutlineCollection />}
            link={{ to: "/pools" }}
          />
          <MetricCard
            label="Vouchers"
            value={vouchers.length}
            tone="success"
            icon={<HiOutlineTicket />}
            link={{ to: "/vouchers" }}
          />
          <MetricCard
            label="Known operators"
            value={operators.length}
            icon={<HiOutlineUsers />}
            link={{ to: "/users" }}
            detail="derived from ownership"
          />
          <MetricCard
            label="Reports"
            value={reports.length}
            tone="muted"
            icon={<HiOutlineDocumentText />}
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel title="Vouchers by kind" empty={kindCounts.length === 0}>
          <ChartContainer config={kindChartConfig} className="h-64 w-full">
            <BarChart data={kindCounts} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeOpacity={0.3} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                className="font-mono text-xs"
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" />
            </BarChart>
          </ChartContainer>
        </ChartPanel>

        <ChartPanel title="Top pool tags" empty={tagCounts.length === 0}>
          <ChartContainer config={tagChartConfig} className="h-64 w-full">
            <BarChart data={tagCounts} layout="vertical" margin={{ left: 4, right: 12 }}>
              <CartesianGrid horizontal={false} strokeOpacity={0.3} />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickLine={false}
                axisLine={false}
                className="font-mono text-xs"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" />
            </BarChart>
          </ChartContainer>
        </ChartPanel>
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <h2 className="mb-4 font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      {empty ? <EmptyState title="No data" description="Nothing to chart yet." /> : children}
    </div>
  );
}

function countBy<T>(items: Array<T>, key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const name = key(item);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count);
}
