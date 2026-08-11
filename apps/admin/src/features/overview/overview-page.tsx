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
import { MetricCard } from "#/components/admin/metric-card";
import { PageHeader } from "#/components/admin/page-header";
import { SectionState } from "#/components/admin/section-state";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "#/components/ui/chart";
import { useKnownOperators } from "#/features/users/use-known-operators";
import { isFigureAvailable } from "#/lib/data-state";
import { useDataState } from "#/lib/use-data-state";

/**
 * Page size for the sampled figures below.
 *
 * Every number on this screen is a sample of one cursor page, not a total —
 * clc-core has no admin aggregate endpoint yet (see docs/admin-architecture.md,
 * Track B2). Until it exists, each figure is labelled as a sample and must never
 * be presented as a total.
 */
const SAMPLE_PAGE_SIZE = 100;
const SAMPLE_DETAIL = `sample of ${SAMPLE_PAGE_SIZE}`;

const kindChartConfig = {
  count: { label: "Vouchers", color: "var(--chart-1)" },
} satisfies ChartConfig;

const tagChartConfig = {
  count: { label: "Pools", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function OverviewPage() {
  const poolsQuery = useQuery(clcQueries.poolList(SAMPLE_PAGE_SIZE));
  const vouchersQuery = useQuery(clcQueries.voucherList(SAMPLE_PAGE_SIZE));
  const reportsQuery = useQuery(clcQueries.reportList(SAMPLE_PAGE_SIZE));
  const operators = useKnownOperators();

  // Each figure resolves its own source query. A failure in one must not blank
  // the others, and must never render as zero.
  const poolsState = useDataState(poolsQuery, (page) => page.pools.length === 0);
  const vouchersState = useDataState(vouchersQuery, (page) => page.vouchers.length === 0);
  const reportsState = useDataState(reportsQuery, (page) => page.reports.length === 0);

  const pools = poolsQuery.data?.pools ?? [];
  const vouchers = vouchersQuery.data?.vouchers ?? [];
  const reports = reportsQuery.data?.reports ?? [];

  // The catalog endpoint omits vouchers without valid coordinates or a known
  // kind, so a page can arrive with fewer rows than it received. Report the gap
  // for this page only; it is not a share of any total.
  const droppedVouchers = (vouchersQuery.data?.receivedCount ?? 0) - vouchers.length;

  const kindCounts = countBy(vouchers, (voucher) => voucher.kind);
  const tagCounts = countBy(
    pools.flatMap((pool) => pool.tags),
    (tag) => tag,
  ).slice(0, 8);

  const failures = [
    poolsState.kind === "error" ? "pools" : null,
    vouchersState.kind === "error" ? "vouchers" : null,
    reportsState.kind === "error" ? "reports" : null,
    operators.isError ? "operators" : null,
  ].filter((name): name is string => name !== null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Sampled figures from the first page of each resource. Not totals."
      />

      {failures.length > 0 ? (
        <Alert className="border-destructive/30 bg-destructive/10">
          <AlertTitle>Some figures could not be loaded</AlertTitle>
          <AlertDescription>
            Failed to load: {failures.join(", ")}. Affected figures show as unavailable rather than
            zero.
          </AlertDescription>
        </Alert>
      ) : null}

      {droppedVouchers > 0 ? (
        <Alert>
          <AlertTitle>
            {droppedVouchers} voucher{droppedVouchers === 1 ? "" : "s"} dropped from this page
          </AlertTitle>
          <AlertDescription>
            The catalog endpoint omits vouchers without valid coordinates or a known kind. They are
            missing from this page's figures and cannot be listed.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pools"
          value={pools.length}
          unavailable={!isFigureAvailable(poolsState)}
          detail={SAMPLE_DETAIL}
          icon={<HiOutlineCollection />}
          link={{ to: "/pools" }}
        />
        <MetricCard
          label="Vouchers"
          value={vouchers.length}
          unavailable={!isFigureAvailable(vouchersState)}
          detail={SAMPLE_DETAIL}
          tone="success"
          icon={<HiOutlineTicket />}
          link={{ to: "/vouchers" }}
        />
        <MetricCard
          label="Pool owners"
          value={operators.operators.length}
          unavailable={operators.isError || operators.isPending}
          detail="in this page"
          icon={<HiOutlineUsers />}
          link={{ to: "/users" }}
        />
        <MetricCard
          label="Reports"
          value={reports.length}
          unavailable={!isFigureAvailable(reportsState)}
          detail={SAMPLE_DETAIL}
          tone="muted"
          icon={<HiOutlineDocumentText />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel title="Vouchers by kind (page sample)">
          <SectionState
            state={vouchersState}
            errorTitle="Could not load vouchers"
            emptyTitle="No data"
            emptyDescription="No vouchers in this page."
            loadingRows={3}
          >
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
          </SectionState>
        </ChartPanel>

        <ChartPanel title="Top pool tags (page sample)">
          <SectionState
            state={poolsState}
            errorTitle="Could not load pools"
            emptyTitle="No data"
            emptyDescription="No pools in this page."
            loadingRows={3}
          >
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
          </SectionState>
        </ChartPanel>
      </div>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-border bg-card p-4">
      <h2 className="mb-4 font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
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
