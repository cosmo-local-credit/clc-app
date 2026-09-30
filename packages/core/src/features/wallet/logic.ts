import { z } from "zod";

const DECIMAL_STRING_PATTERN = /^\d+$/;
const TOKEN_AMOUNT_PATTERN = /^\d+(?:\.\d*)?$/;

export const SEND_SHARE_PERMISSION = {
  email: 1 << 0,
  phone: 1 << 1,
  location: 1 << 2,
} as const;

export const SEND_SHARE_PERMISSION_ALL =
  SEND_SHARE_PERMISSION.email | SEND_SHARE_PERMISSION.phone | SEND_SHARE_PERMISSION.location;

export type SendShareSelection = {
  email: boolean;
  phone: boolean;
  location: boolean;
};

export function buildSendSharePermission(selection: SendShareSelection): number {
  let permission = 0;
  if (selection.email) permission |= SEND_SHARE_PERMISSION.email;
  if (selection.phone) permission |= SEND_SHARE_PERMISSION.phone;
  if (selection.location) permission |= SEND_SHARE_PERMISSION.location;
  return permission;
}

export function hasSendSharePermission(permission: number, flag: number): boolean {
  return (permission & flag) === flag;
}

export const sendShareFormSchema = z
  .object({
    note: z.string().trim().max(500, { message: "Message must be 500 characters or fewer" }),
    email: z.boolean(),
    phone: z.boolean(),
    location: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.note || value.email || value.phone || value.location) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Add a message or choose profile details",
      path: ["note"],
    });
  });

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
  locale?: string,
): string {
  assertRawTokenAmount(rawAmount);
  assertTokenDecimals(decimals);
  assertFractionDigits(fractionDigits, "Fraction digits");

  const amount = BigInt(rawAmount);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const remainder = amount % scale;
  const formattedWhole = locale
    ? new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
        useGrouping: true,
      }).format(whole)
    : whole.toString();

  if (fractionDigits === 0) return formattedWhole;

  const displayedFractionDigits = Math.min(decimals, fractionDigits);
  const fraction =
    displayedFractionDigits === 0
      ? ""
      : (remainder / 10n ** BigInt(decimals - displayedFractionDigits))
          .toString()
          .padStart(displayedFractionDigits, "0");

  const fixedFraction = fraction.padEnd(fractionDigits, "0");
  if (!locale) return `${formattedWhole}.${fixedFraction}`;

  // Group the whole as a BigInt so a wallet balance can never cross through
  // Number and lose raw-unit precision. Localize the already-exact fraction
  // one digit at a time so non-Latin numbering systems keep the same guarantee.
  const fractionFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: false,
  });
  const localizedDigits = Array.from({ length: 10 }, (_, digit) => fractionFormatter.format(digit));
  const localizedFraction = fixedFraction.replace(
    /\d/g,
    (digit) => localizedDigits[digit.charCodeAt(0) - 48] ?? digit,
  );
  const decimalSeparator =
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
      useGrouping: false,
    })
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? ".";

  return `${formattedWhole}${decimalSeparator}${localizedFraction}`;
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
