const NON_TERMINAL_OTX_STATUSES = new Set(["", "PENDING", "IN_NETWORK"]);

export function isTerminalOtxFailure(status: string): boolean {
  return status !== "SUCCESS" && !NON_TERMINAL_OTX_STATUSES.has(status);
}

/**
 * When a relayed transaction was submitted, as its receipt shows it: the
 * locale's medium date and short time. A value that is not a date is shown as
 * it came rather than as "Invalid Date".
 */
export function formatSubmittedAt(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
