import { formatVoucherUnitValue, sumDecimalAmounts } from "@clc/core/features/market/logic";
import { normalizeUnitOfAccount } from "@clc/core/lib/currencies";

/** What one holding is worth in the wallet's unit, or why it has no figure. */
export type HoldingValue =
  | { status: "priced"; value: string }
  | { status: "pending" }
  | { status: "unpriced" };

export type HoldingValuationInput = {
  /** The balance as an exact decimal in voucher units, e.g. `"12.5"`. */
  amount: string;
  /** A stable the off-ramp pays out: one unit is one US dollar. */
  stable: boolean;
  /**
   * The issuer's stated rate, `1 voucher = value unit`. `undefined` while the
   * voucher record is loading; `null` when it could not be read.
   */
  rate: { value: string | null; unit: string | null } | null | undefined;
};

/**
 * Restates one holding in `unit`.
 *
 * A voucher is worth what its issuer says one unit is worth, in the issuer's
 * unit; a stable is a dollar. A figure in another unit is converted only where
 * the app holds a real rate for it — US dollars into the off-ramp's currency,
 * at the rate a cash-out pays (`usdRate`) — and is otherwise left unpriced
 * rather than summed as if units were interchangeable.
 */
export function valueHolding(
  input: HoldingValuationInput,
  unit: string,
  usdRate: { unit: string; value: string | null | undefined } | null,
): HoldingValue {
  const native = input.stable
    ? formatVoucherUnitValue(input.amount, "1", "USD")
    : input.rate === undefined
      ? "pending"
      : input.rate === null
        ? null
        : formatVoucherUnitValue(input.amount, input.rate.value, input.rate.unit);
  if (native === "pending") return { status: "pending" };
  if (!native) return { status: "unpriced" };

  const nativeUnit = normalizeUnitOfAccount(native.unit);
  if (nativeUnit === unit) return { status: "priced", value: native.value };
  if (nativeUnit === "USD" && usdRate && usdRate.unit === unit) {
    if (usdRate.value === undefined) return { status: "pending" };
    const converted = formatVoucherUnitValue(native.value, usdRate.value, unit);
    return converted ? { status: "priced", value: converted.value } : { status: "unpriced" };
  }
  return { status: "unpriced" };
}

/**
 * The unit a wallet total is stated in: the person's preferred currency, or
 * failing that the unit most of their priced vouchers are stated in.
 */
export function walletValuationUnit(
  preferred: string | null | undefined,
  rateUnits: readonly (string | null | undefined)[],
): string | null {
  const chosen = preferred?.trim();
  if (chosen) return normalizeUnitOfAccount(chosen);
  const counts = new Map<string, number>();
  for (const raw of rateUnits) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const unit = normalizeUnitOfAccount(trimmed);
    counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [unit, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) best = unit;
  }
  return best;
}

/** The sum of every priced holding; pending until each holding has answered. */
export function walletTotal(values: readonly HoldingValue[]): {
  status: "pending" | "ready";
  total: string;
  /** Holdings with a balance but no figure in the wallet's unit. */
  unpriced: number;
} {
  const priced = values.flatMap((value) => (value.status === "priced" ? [value.value] : []));
  return {
    status: values.some((value) => value.status === "pending") ? "pending" : "ready",
    total: sumDecimalAmounts(priced) ?? "0",
    unpriced: values.filter((value) => value.status === "unpriced").length,
  };
}
