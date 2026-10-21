import { formatUnitOfAccountDisplayValue } from "@clc/core/features/market/logic";

export function formatTransferDate(
  dateBlock: string,
  locale?: Intl.LocalesArgument,
  timeZone?: string,
): string {
  const date = new Date(dateBlock);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/**
 * Formats an immutable Unit-of-Account snapshot returned with Activity. Both
 * fields are required; partial or malformed backend data stays hidden rather
 * than being presented as a historical value.
 */
export function formatTransferUnitValue(
  value: string | undefined,
  unit: string | undefined,
  locale?: string,
): string | null {
  const normalizedUnit = unit?.trim();
  if (!normalizedUnit || Array.from(normalizedUnit).length > 32 || value === undefined) {
    return null;
  }
  const localizedValue = formatUnitOfAccountDisplayValue(value, locale);
  return localizedValue ? `${localizedValue} ${normalizedUnit}` : null;
}
