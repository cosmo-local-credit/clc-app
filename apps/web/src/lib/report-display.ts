/**
 * A report timestamp, as the feed and detail card show it.
 *
 * The year is always included: approved reports span January 2025 to July 2026,
 * so a month/day label would be ambiguous, and a relative one ("18 months ago")
 * would be useless for most of the catalog. No time of day — neither surface
 * needs minutes.
 */
export function formatReportDate(value: string | null, locale?: Intl.LocalesArgument): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * A report's period as a single range label, collapsing to one date when both
 * ends fall on the same day — 778 of the imported reports are single-day.
 */
export function formatReportPeriod(
  from: string | null,
  to: string | null,
  locale?: Intl.LocalesArgument,
): string {
  const start = formatReportDate(from, locale);
  const end = formatReportDate(to, locale);
  if (!start) return end;
  if (!end || start === end) return start;
  return `${start} – ${end}`;
}
