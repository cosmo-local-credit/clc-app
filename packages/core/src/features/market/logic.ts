import { formatTokenAmountFixed } from "../wallet/logic";

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

export type OfferingDisplayPrice = {
  value: string;
  unit: string;
};

/**
 * A plain non-negative decimal, matching the column's `>= 0` check. No sign, no
 * exponent, no separators — `NUMERIC::TEXT` emits none of those, so anything
 * that does is corrupt rather than merely unusual.
 */
const DECIMAL = /^\d+(\.\d+)?$/;

/** Localizes one exact decimal display value without crossing through Number. */
export function formatOfferingDisplayValue(value: string, locale?: string): string | null {
  const trimmed = value.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const [whole = "", fraction = ""] = trimmed.split(".");
  return formatTokenAmountFixed(`${whole}${fraction}`, fraction.length, fraction.length, locale);
}

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
 * An offering price in the unit a person uses to compare value.
 *
 * Offering writes store voucher units, while a voucher says what one of those
 * units is worth: `1 voucher = voucherValue voucherUoa`. A complete positive
 * rate therefore wins for display; legacy vouchers without one keep their own
 * symbol so their price remains legible rather than disappearing.
 */
export function formatOfferingDisplayPrice(
  price: string | null,
  voucherValue: string | null,
  voucherUoa: string | null,
  voucherSymbol: string,
): OfferingDisplayPrice | null {
  const unitPrice = formatOfferingPrice(price);
  if (!unitPrice) return null;

  const rate = formatVoucherRate(voucherValue, voucherUoa);
  if (rate && !isZero(rate.value)) {
    return {
      value: multiplyDecimals(unitPrice.value, rate.value),
      unit: rate.unit,
    };
  }

  const symbol = voucherSymbol.trim();
  return symbol ? { value: unitPrice.value, unit: symbol } : null;
}

/**
 * A positive available quantity. The unit is issuer-authored free text and is
 * therefore trimmed but never translated or normalised.
 */
export function formatOfferingQuantity(
  quantity: string | null,
  unit: string | null,
  suppressSyntheticOne = false,
): OfferingQuantity | null {
  const trimmedQuantity = quantity?.trim();
  if (!trimmedQuantity || !DECIMAL.test(trimmedQuantity) || isZero(trimmedQuantity)) return null;
  const value = trimScale(trimmedQuantity);
  if (suppressSyntheticOne && value === "1") return null;
  return {
    value,
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
export function formatOfferingTotal(
  price: string | null,
  count: number | string | bigint,
): { value: string } | null {
  const unitPrice = formatOfferingPrice(price);
  const quantity = parsePositiveInteger(count);
  if (!unitPrice || quantity === null) return null;

  const [whole = "", fraction = ""] = unitPrice.value.split(".");
  const scaled = BigInt(whole + fraction) * quantity;
  if (!fraction) return { value: scaled.toString() };

  // Pad so a product smaller than one unit keeps its leading zero: 0.5 × 1
  // must render as "0.5", never ".5".
  const digits = scaled.toString().padStart(fraction.length + 1, "0");
  const boundary = digits.length - fraction.length;
  return { value: trimScale(`${digits.slice(0, boundary)}.${digits.slice(boundary)}`) };
}

/** A selected quantity multiplied by the same converted price shown per unit. */
export function formatOfferingDisplayTotal(
  price: string | null,
  voucherValue: string | null,
  voucherUoa: string | null,
  voucherSymbol: string,
  count: number | string | bigint,
): OfferingDisplayPrice | null {
  const displayPrice = formatOfferingDisplayPrice(price, voucherValue, voucherUoa, voucherSymbol);
  if (!displayPrice) return null;

  const total = formatOfferingTotal(displayPrice.value, count);
  return total ? { ...total, unit: displayPrice.unit } : null;
}

/** Adds non-negative decimal strings exactly, preserving no unnecessary scale. */
export function sumDecimalAmounts(values: readonly string[]): string | null {
  if (values.length === 0) return "0";
  if (values.some((value) => !DECIMAL.test(value.trim()))) return null;

  const scale = Math.max(...values.map((value) => value.trim().split(".")[1]?.length ?? 0));
  const sum = values.reduce((total, value) => {
    const [whole = "", fraction = ""] = value.trim().split(".");
    return total + BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  }, 0n);

  if (scale === 0) return sum.toString();
  const digits = sum.toString().padStart(scale + 1, "0");
  const boundary = digits.length - scale;
  return trimScale(`${digits.slice(0, boundary)}.${digits.slice(boundary)}`);
}

function isZero(value: string): boolean {
  return /^0+(\.0+)?$/.test(value);
}

function parsePositiveInteger(value: number | string | bigint): bigint | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : null;
  }
  const text = value.toString();
  return /^[1-9]\d*$/.test(text) ? BigInt(text) : null;
}

/** Multiplies two valid decimal strings exactly and returns an unpadded decimal. */
function multiplyDecimals(left: string, right: string): string {
  const [leftWhole = "", leftFraction = ""] = left.split(".");
  const [rightWhole = "", rightFraction = ""] = right.split(".");
  const scale = leftFraction.length + rightFraction.length;
  const product = BigInt(leftWhole + leftFraction) * BigInt(rightWhole + rightFraction);
  if (scale === 0) return product.toString();

  const digits = product.toString().padStart(scale + 1, "0");
  const boundary = digits.length - scale;
  return trimScale(`${digits.slice(0, boundary)}.${digits.slice(boundary)}`);
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
