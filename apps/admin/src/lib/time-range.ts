/**
 * Dashboard time-range presets, matching wafer-ui.
 *
 * The URL holds a relative preset or an absolute custom window. The API always
 * receives a resolved range so catalog and federation counts share one clock.
 */

export const TIME_RANGE_PRESETS = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "1d", label: "1d" },
] as const;

export type TimeRangePreset = (typeof TIME_RANGE_PRESETS)[number]["value"] | "custom";

export const DEFAULT_TIME_RANGE: Exclude<TimeRangePreset, "custom"> = "1d";

const PRESET_MS: Record<Exclude<TimeRangePreset, "custom">, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export type TimeRangeValue = {
  range?: TimeRangePreset;
  since?: string;
  until?: string;
};

export type DashboardSearch = TimeRangeValue;

const PRESET_VALUES = new Set<string>([...TIME_RANGE_PRESETS.map((p) => p.value), "custom"]);

export function parseDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const rangeRaw = typeof search.range === "string" ? search.range : undefined;
  const range = rangeRaw && PRESET_VALUES.has(rangeRaw) ? (rangeRaw as TimeRangePreset) : undefined;
  const since =
    typeof search.since === "string" && search.since.trim() ? search.since.trim() : undefined;
  const until =
    typeof search.until === "string" && search.until.trim() ? search.until.trim() : undefined;

  if (range === "custom" && since && until) return { range, since, until };
  if (range && range !== "custom") return { range };
  return {};
}

export function compactSearch<T extends Record<string, unknown>>(search: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

export function timeRangeToApiParams(value: TimeRangeValue): {
  range: string;
  since?: string;
  until?: string;
} {
  const range = value.range ?? DEFAULT_TIME_RANGE;
  if (range === "custom" && value.since && value.until) {
    return { range: "custom", since: value.since, until: value.until };
  }
  if (range === "custom") return { range: DEFAULT_TIME_RANGE };
  return { range };
}

export function resolveTimeWindow(value: TimeRangeValue): { since: string; until: string } {
  const range = value.range ?? DEFAULT_TIME_RANGE;
  if (range === "custom" && value.since && value.until) {
    return { since: value.since, until: value.until };
  }
  const until = new Date();
  const ms = range === "custom" ? PRESET_MS[DEFAULT_TIME_RANGE] : PRESET_MS[range];
  return { since: new Date(until.getTime() - ms).toISOString(), until: until.toISOString() };
}

export function formatTimeRangeLabel(sinceIso?: string, untilIso?: string): string {
  if (!sinceIso || !untilIso) return "Custom range";
  const since = new Date(sinceIso);
  const until = new Date(untilIso);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) return "Custom range";
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  return `${since.toLocaleString(undefined, opts)} – ${until.toLocaleString(undefined, opts)}`;
}

/** Parse API bucket labels (`30s`, `5m`, `1h`, `6h`, `1d`) into seconds. */
export function parseBucketSeconds(bucket: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(bucket);
  if (!match) return 3600;
  const n = Number(match[1]);
  switch (match[2]) {
    case "s":
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86_400;
    default:
      return 3600;
  }
}

/**
 * Axis tick for a series point. Uses the API bucket, not the preset name —
 * a 14-day custom window is `1d` buckets and must show dates, not "3:00 AM".
 */
export function formatSeriesTick(iso: string, bucket: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = parseBucketSeconds(bucket);
  if (seconds >= 86_400) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (seconds >= 6 * 3600) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
    });
  }
  if (seconds < 60) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatSeriesTooltip(iso: string, bucket: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = parseBucketSeconds(bucket);
  if (seconds >= 86_400) {
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
