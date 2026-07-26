/**
 * A voucher's exchange rate, ready for display: "1 {symbol} = {value} {unit}".
 *
 * Deliberately not a string. The web layer routes the whole sentence through
 * one Lingui message so translators can reorder every part of it, which
 * concatenating translated fragments would prevent.
 */
export type VoucherRate = {
  value: string;
  unit: string;
};

/**
 * A plain non-negative decimal, matching the column's `>= 0` check. No sign, no
 * exponent, no separators — `NUMERIC::TEXT` emits none of those, so anything
 * that does is corrupt rather than merely unusual.
 */
const DECIMAL = /^\d+(\.\d+)?$/;

export function formatVoucherRate(value: string | null, unit: string | null): VoucherRate | null {
  // The unit is free text (KSH, Ksh, usd, Hour all occur), so it is only
  // trimmed. Normalising it would misreport what the issuer wrote.
  const trimmedUnit = unit?.trim();
  const trimmedValue = value?.trim();
  if (!trimmedUnit || !trimmedValue || !DECIMAL.test(trimmedValue)) return null;

  return { value: trimScale(trimmedValue), unit: trimmedUnit };
}

/**
 * Drops the scale `NUMERIC::TEXT` pads with, without going through Number:
 * a voucher value may have more digits than a double can hold exactly, and
 * reformatting it would silently change the issuer's stated rate.
 */
function trimScale(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}
