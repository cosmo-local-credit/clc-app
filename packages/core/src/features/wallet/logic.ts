const DECIMAL_STRING_PATTERN = /^\d+$/;
const TOKEN_AMOUNT_PATTERN = /^\d+(?:\.\d*)?$/;

export function formatTokenAmount(
  rawAmount: string,
  decimals: number,
  maxFractionDigits = 2,
): string {
  assertRawTokenAmount(rawAmount);
  assertTokenDecimals(decimals);
  assertFractionDigits(maxFractionDigits, "Maximum fraction digits");

  const amount = BigInt(rawAmount);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const remainder = amount % scale;

  if (maxFractionDigits === 0 || decimals === 0 || remainder === 0n) {
    return whole.toString();
  }

  const displayedFractionDigits = Math.min(decimals, maxFractionDigits);
  const fractionScale = 10n ** BigInt(decimals - displayedFractionDigits);
  const fraction = remainder / fractionScale;
  const paddedFraction = fraction.toString().padStart(displayedFractionDigits, "0");
  const trimmedFraction = paddedFraction.replace(/0+$/, "");

  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole.toString();
}

export function formatTokenAmountFixed(
  rawAmount: string,
  decimals: number,
  fractionDigits = 2,
): string {
  assertRawTokenAmount(rawAmount);
  assertTokenDecimals(decimals);
  assertFractionDigits(fractionDigits, "Fraction digits");

  const amount = BigInt(rawAmount);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const remainder = amount % scale;

  if (fractionDigits === 0) return whole.toString();

  const displayedFractionDigits = Math.min(decimals, fractionDigits);
  const fraction =
    displayedFractionDigits === 0
      ? ""
      : (remainder / 10n ** BigInt(decimals - displayedFractionDigits))
          .toString()
          .padStart(displayedFractionDigits, "0");

  return `${whole}.${fraction.padEnd(fractionDigits, "0")}`;
}

export function parseTokenAmount(amount: string, decimals: number): string {
  assertTokenDecimals(decimals);
  const trimmed = amount.trim();
  if (!TOKEN_AMOUNT_PATTERN.test(trimmed)) {
    throw new Error("Token amount must be a non-negative decimal string.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error("Token amount has more decimal places than the token supports.");
  }

  const scale = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(whole) * scale;
  const fractionalUnits = fraction ? BigInt(fraction.padEnd(decimals, "0")) : 0n;
  return (wholeUnits + fractionalUnits).toString();
}

function assertRawTokenAmount(rawAmount: string): void {
  if (!DECIMAL_STRING_PATTERN.test(rawAmount)) {
    throw new Error("Token amount must be a non-negative integer string.");
  }
}

function assertTokenDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("Token decimals must be a non-negative integer.");
  }
}

function assertFractionDigits(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}
