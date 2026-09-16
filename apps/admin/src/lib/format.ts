/**
 * Presentation-only formatters for the admin console.
 *
 * Domain formatting lives in @clc/core and must not be duplicated here —
 * token amounts use formatTokenAmount / formatTokenAmountFixed from
 * @clc/core/features/wallet/logic, and truncated addresses use
 * formatVoucherAddress from @clc/core/features/catalog/logic.
 */

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/** Compact counts for metric tiles, where column width is fixed. */
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

/** Basis points as stored by clc-core (parts per million) rendered as a percent. */
export function formatFeePpm(ppm: number | null): string {
  if (ppm === null) return "—";
  return `${(ppm / 10_000).toFixed(2)}%`;
}

/**
 * Up to two initials from a record's name, for an avatar with no image.
 *
 * Falls back to one character so the circle is never empty, which would read as a
 * failed image rather than as a record without a photo.
 */
export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}
