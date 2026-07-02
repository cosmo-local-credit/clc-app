const DECIMAL_STRING_PATTERN = /^\d+$/;

export function formatTokenAmount(
  rawAmount: string,
  decimals: number,
  maxFractionDigits = 2,
): string {
  if (!DECIMAL_STRING_PATTERN.test(rawAmount)) {
    throw new Error("Token amount must be a non-negative integer string.");
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("Token decimals must be a non-negative integer.");
  }
  if (!Number.isInteger(maxFractionDigits) || maxFractionDigits < 0) {
    throw new Error("Maximum fraction digits must be a non-negative integer.");
  }

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
