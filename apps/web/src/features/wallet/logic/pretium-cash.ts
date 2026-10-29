import type { PretiumCashTransaction } from "@clc/api/features/pretium/client";

// We only onramp Tether. `ONRAMP_ASSET` is the Pretium asset code sent to the
// backend; `ONRAMP_ASSET_LABEL` is the branded display form (USD₮).
export const ONRAMP_ASSET = "USDT" as const;
export const ONRAMP_ASSET_LABEL = "USD₮";
const COMPLETE_PRETIUM_STATUSES = new Set(["COMPLETE", "COMPLETED", "SUCCESS", "SETTLED"]);

// Safaricom MSISDN ranges (0/+254/254 prefix). A non-match is a soft signal
// only: the line may be a ported Safaricom number, so we warn without blocking
// the top-up. MPESA only settles to Safaricom lines.
const SAFARICOM_REGEX = /^(?:0|\+?254)(?:11[0-5]|7(?:[0129][0-9]|4[0-3568]|5[7-9]|6[89]))[0-9]{6}$/;

export function isSafaricomNumber(phone: string): boolean {
  return SAFARICOM_REGEX.test(phone.replace(/\s+/g, ""));
}

/** KES cash amounts are whole shillings only. */
export function sanitizeKes(raw: string): string {
  return (raw.split(".")[0] ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function isCompletePretiumStatus(status: string): boolean {
  return COMPLETE_PRETIUM_STATUSES.has(status.trim().toUpperCase());
}

export function shortenIdentifier(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function cashTimestamp(date: string): number {
  const value = Date.parse(date);
  return Number.isFinite(value) ? value : 0;
}

export function formatHistoryKes(transaction: PretiumCashTransaction): string {
  if (!transaction.amountKes) return "—";
  return transaction.amountKes.split(".")[0] || transaction.amountKes;
}

export function formatCashDate(date: string, locale: string): string {
  if (!date) return "—";
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
