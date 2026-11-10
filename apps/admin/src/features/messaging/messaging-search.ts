import type { AbuseReportStatus, HelpdeskStatus } from "@clc/core/features/messaging/logic";

/**
 * Typed search params for the two messaging queues.
 *
 * Each queue opens on the work still to do, so the default status is `open` and
 * is left out of the URL. An unknown value normalizes to that default rather
 * than throwing, like every other admin list route. The cursor is not in the
 * URL: clc-core's cursors are opaque and the queues page by appending.
 */

export const HELPDESK_STATUSES = ["open", "resolved"] as const satisfies readonly HelpdeskStatus[];

export const ABUSE_REPORT_STATUSES = [
  "open",
  "dismissed",
  "actioned",
] as const satisfies readonly AbuseReportStatus[];

export type HelpdeskSearch = { status?: Exclude<HelpdeskStatus, "open"> };
export type AbuseReportSearch = { status?: Exclude<AbuseReportStatus, "open"> };

export function parseHelpdeskSearch(search: Record<string, unknown>): HelpdeskSearch {
  return search.status === "resolved" ? { status: "resolved" } : {};
}

export function parseAbuseReportSearch(search: Record<string, unknown>): AbuseReportSearch {
  return search.status === "dismissed" || search.status === "actioned"
    ? { status: search.status }
    : {};
}
