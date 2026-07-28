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

export type OfferingQuantity = {
  value: string;
  unit: string | null;
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
 * A positive offering price in voucher units. `null` means the issuer did not
 * state a usable price, including imported zero values.
 */
export function formatOfferingPrice(price: string | null): { value: string } | null {
  const trimmedPrice = price?.trim();
  if (!trimmedPrice || !DECIMAL.test(trimmedPrice) || isZero(trimmedPrice)) return null;
  return { value: trimScale(trimmedPrice) };
}

/**
 * A positive available quantity. The unit is issuer-authored free text and is
 * therefore trimmed but never translated or normalised.
 */
export function formatOfferingQuantity(
  quantity: string | null,
  unit: string | null,
): OfferingQuantity | null {
  const trimmedQuantity = quantity?.trim();
  if (!trimmedQuantity || !DECIMAL.test(trimmedQuantity) || isZero(trimmedQuantity)) return null;
  return {
    value: trimScale(trimmedQuantity),
    unit: unit?.trim() || null,
  };
}

/**
 * `price × count` for the quantity a buyer picked, exact.
 *
 * The multiplication runs on integers and reinserts the decimal point rather
 * than going through `Number`: a price may carry more digits than a double
 * holds exactly, and a total that silently rounds is a total nobody can check.
 */
export function formatOfferingTotal(price: string | null, count: number): { value: string } | null {
  const unitPrice = formatOfferingPrice(price);
  if (!unitPrice || !Number.isInteger(count) || count < 1) return null;

  const [whole = "", fraction = ""] = unitPrice.value.split(".");
  const scaled = BigInt(whole + fraction) * BigInt(count);
  if (!fraction) return { value: scaled.toString() };

  // Pad so a product smaller than one unit keeps its leading zero: 0.5 × 1
  // must render as "0.5", never ".5".
  const digits = scaled.toString().padStart(fraction.length + 1, "0");
  const boundary = digits.length - fraction.length;
  return { value: trimScale(`${digits.slice(0, boundary)}.${digits.slice(boundary)}`) };
}

function isZero(value: string): boolean {
  return /^0+(\.0+)?$/.test(value);
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
