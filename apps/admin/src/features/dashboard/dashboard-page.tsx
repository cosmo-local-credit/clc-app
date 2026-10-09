import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  HiOutlineCollection,
  HiOutlineDocumentText,
  HiOutlineLightningBolt,
  HiOutlineSwitchHorizontal,
  HiOutlineTicket,
  HiOutlineUsers,
} from "react-icons/hi";
import { TimeRangeSelect } from "#/components/admin/time-range-select";
import { MetricCard } from "#/components/admin/metric-card";
import { PageHeader } from "#/components/admin/page-header";
import { SectionHeading } from "#/components/admin/section-heading";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "#/components/ui/chart";
import { isFigureAvailable } from "#/lib/data-state";
import { addressUrl } from "#/lib/explorer";
import { useDataState } from "#/lib/use-data-state";
import {
  DEFAULT_TIME_RANGE,
  type DashboardSearch,
  formatSeriesTick,
  formatSeriesTooltip,
} from "#/lib/time-range";
import {
  formatRelayerGas,
  RELAYER_GAS_FLOOR_LABEL,
  RELAYER_GAS_FLOOR_WEI,
  relayerGasTone,
} from "./relayer-gas";
import { LatestSwapsPanel } from "./latest-swaps-panel";
import { useDashboardStats, useRelayerGas } from "./use-dashboard-metrics";

const catalogChartConfig = {
  reports: { label: "Reports", color: "var(--chart-1)" },
  vouchers: { label: "Vouchers", color: "var(--chart-2)" },
  pools: { label: "Pools", color: "var(--chart-3)" },
} satisfies ChartConfig;

const transactionChartConfig = {
  transactions: { label: "Transactions", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function DashboardPage({
  search,
  onSearchChange,
}: {
  search: DashboardSearch;
  onSearchChange: (next: DashboardSearch) => void;
}) {
  const statsQuery = useDashboardStats(search);
  const gasQuery = useRelayerGas();

  const statsState = useDataState(statsQuery, () => false);
  const gasState = useDataState(gasQuery, () => false);

  const stats = statsQuery.data;
  const gasWei = gasQuery.data ? BigInt(gasQuery.data.wei) : 0n;
  const gasAvailable = isFigureAvailable(gasState);
  const statsAvailable = isFigureAvailable(statsState);
  const transactionsAvailable = statsAvailable && stats?.transactions !== null;
  const preset = stats?.range.preset ?? search.range ?? DEFAULT_TIME_RANGE;
  const bucket = stats?.range.bucket;
  const rangeDetail = stats?.range.preset === "custom" ? "custom range" : `last ${preset}`;

  const catalogData = stats?.catalogSeries ?? [];
  const transactionData = stats?.transactionSeries ?? [];

  const failures = [
    statsState.kind === "error" ? "totals" : null,
    gasState.kind === "error" ? "relayer gas" : null,
  ].filter((name): name is string => name !== null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        actions={<TimeRangeSelect value={search} onChange={onSearchChange} />}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Pools"
          value={stats?.pools ?? 0}
          unavailable={!statsAvailable}
          icon={<HiOutlineCollection />}
          link={{ to: "/pools" }}
        />
        <MetricCard
          label="Vouchers"
          value={stats?.vouchers ?? 0}
          unavailable={!statsAvailable}
          icon={<HiOutlineTicket />}
          link={{ to: "/vouchers" }}
        />
        <MetricCard
          label="Accounts"
          value={stats?.accounts ?? 0}
          unavailable={!statsAvailable}
          icon={<HiOutlineUsers />}
          link={{ to: "/users" }}
        />
        <MetricCard
          label="Reports"
          value={stats?.reports ?? 0}
          unavailable={!statsAvailable}
          detail={statsAvailable ? rangeDetail : undefined}
          icon={<HiOutlineDocumentText />}
        />
        <MetricCard
          label="Relayer gas"
          value={gasAvailable ? formatRelayerGas(gasQuery.data?.wei ?? "0") : "—"}
          unavailable={!gasAvailable}
          tone={gasAvailable ? relayerGasTone(gasWei) : "muted"}
          detail={
            gasAvailable && gasWei < RELAYER_GAS_FLOOR_WEI
              ? `below ${RELAYER_GAS_FLOOR_LABEL}`
              : undefined
          }
          icon={<HiOutlineLightningBolt />}
          link={gasQuery.data?.address ? { href: addressUrl(gasQuery.data.address) } : undefined}
        />
        <MetricCard
          label="Transactions"
          value={stats?.transactions ?? 0}
          unavailable={!transactionsAvailable}
          detail={transactionsAvailable ? rangeDetail : undefined}
          icon={<HiOutlineSwitchHorizontal />}
          link={{ to: "/transactions/vouchers" }}
        />
      </div>

      <LatestSwapsPanel />

      <div className="grid gap-4 xl:grid-cols-2">
        <SeriesChart
          title="Catalog"
          bucket={bucket}
          loading={!statsAvailable}
          data={catalogData}
          config={catalogChartConfig}
          lines={["reports", "vouchers", "pools"]}
        />
        <SeriesChart
          title="Transactions"
          bucket={bucket}
          loading={!statsAvailable}
          data={transactionData}
          config={transactionChartConfig}
          lines={["transactions"]}
        />
      </div>
    </div>
  );
}

function SeriesChart({
  title,
  bucket,
  loading,
  data,
  config,
  lines,
}: {
  title: string;
  bucket?: string;
  loading: boolean;
  data: Array<{ t: string } & Record<string, string | number>>;
  config: ChartConfig;
  lines: Array<string>;
}) {
  const tickBucket = bucket ?? "1h";
  return (
    <div className="border-border bg-card border p-4">
      <div className="mb-4 flex items-end justify-between gap-3">
        <SectionHeading>{title}</SectionHeading>
        {bucket ? (
          <span className="text-muted-foreground font-mono text-xs">bucket {bucket}</span>
        ) : null}
      </div>
      {loading ? (
        <p className="text-muted-foreground py-16 text-sm">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground py-16 text-sm">No activity in this range.</p>
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto h-64 w-full"
          initialDimension={{ width: 560, height: 256 }}
        >
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ left: 4, right: 12, top: 8, bottom: 8 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => formatSeriesTick(String(value), tickBucket)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={36}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => formatSeriesTooltip(String(value), tickBucket)}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {lines.map((key) => (
              <Line
                key={key}
                type="linear"
                dataKey={key}
                stroke={`var(--color-${key})`}
                strokeWidth={1.25}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </div>
  );
}
