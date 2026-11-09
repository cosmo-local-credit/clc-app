import type { AccountActivityItem, ActivityLeg } from "@clc/api/features/accounts/client";
import { formatTokenAmount } from "@clc/core/features/wallet/logic";

import type { ActivityRange } from "#/lib/navigation/activity-search";

const RANGE_DAYS: Record<ActivityRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 86_400_000;

/** The oldest timestamp a range keeps, or null for all time. */
export function activityRangeStart(range: ActivityRange | undefined, now: number): number | null {
  return range ? now - RANGE_DAYS[range] * DAY_MS : null;
}

function activityLegs(item: AccountActivityItem): readonly ActivityLeg[] {
  return item.kind === "swapped" ? [item.sent, item.received] : [item.transfer];
}

/** The distinct vouchers the loaded rows move, in first-seen order. */
export function activityVouchers(
  rows: readonly AccountActivityItem[],
): { address: string; symbol: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const leg of activityLegs(row)) {
      if (!seen.has(leg.tokenAddress)) seen.set(leg.tokenAddress, leg.tokenSymbol);
    }
  }
  return Array.from(seen, ([address, symbol]) => ({ address, symbol }));
}

/** Narrows loaded rows to one voucher and a date window. Addresses are checksummed. */
export function filterActivityRows(
  rows: readonly AccountActivityItem[],
  { voucher, start }: { voucher?: string; start: number | null },
): AccountActivityItem[] {
  return rows.filter((row) => {
    if (voucher && !activityLegs(row).some((leg) => leg.tokenAddress === voucher)) return false;
    if (start !== null && (Date.parse(row.dateBlock) || 0) < start) return false;
    return true;
  });
}

function csvCell(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const CSV_HEADER = [
  "date",
  "type",
  "status",
  "sent_amount",
  "sent_token",
  "received_amount",
  "received_token",
  "counterparty",
  "tx_hash",
];

/** RFC 4180 CSV of activity rows, canonical ASCII amounts and ISO dates. */
export function activityCsv(rows: readonly AccountActivityItem[]): string {
  const lines = rows.map((row) => {
    const sent = row.kind === "swapped" ? row.sent : row.kind === "sent" ? row.transfer : null;
    const received =
      row.kind === "swapped" ? row.received : row.kind === "sent" ? null : row.transfer;
    const counterparty =
      row.kind === "swapped"
        ? row.poolAddresses.join(" ")
        : row.kind === "creation"
          ? ""
          : row.counterpartyAddress;
    return [
      row.dateBlock,
      row.kind,
      row.success ? "confirmed" : "failed",
      sent ? formatTokenAmount(sent.amount, sent.tokenDecimals, sent.tokenDecimals) : "",
      sent?.tokenSymbol ?? "",
      received
        ? formatTokenAmount(received.amount, received.tokenDecimals, received.tokenDecimals)
        : "",
      received?.tokenSymbol ?? "",
      counterparty,
      row.txHash,
    ]
      .map(csvCell)
      .join(",");
  });
  return [CSV_HEADER.join(","), ...lines].join("\r\n");
}
