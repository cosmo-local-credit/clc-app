import type { CreditRoute } from "@clc/api/features/credit-router/client";
import { formatCreditRate, type CreditQuoteMode } from "@clc/core/features/credit-router/logic";
import { formatTokenAmountFixed } from "@clc/core/features/wallet/logic";

import type { VoucherLabel } from "#/features/credit/hooks/use-voucher-labels";
import { creditRouteVouchers } from "#/features/credit/logic/credit-routes";

export type Labels = Map<string, VoucherLabel>;

export function symbolOf(labels: Labels, address: string): string {
  return labels.get(address.toLowerCase())?.symbol ?? `${address.slice(0, 6)}…`;
}

export function amountOf(
  labels: Labels,
  address: string,
  raw: string,
  locale: string,
): string | null {
  const decimals = labels.get(address.toLowerCase())?.decimals;
  if (decimals === null || decimals === undefined) return null;
  return formatTokenAmountFixed(raw, decimals, 2, locale);
}

/**
 * "1 CCC ≈ 1.02 AAA" when getting, "1 AAA ≈ 0.98 CCC" when spending: one
 * whole unit of the voucher the amount is counted in. Null when the rate or
 * a voucher's decimals is unknown.
 */
export function rateOf(
  route: CreditRoute,
  mode: CreditQuoteMode,
  labels: Labels,
  locale: string,
): string | null {
  const vouchers = creditRouteVouchers(route);
  const input = vouchers[0]!;
  const output = vouchers.at(-1)!;
  const decimalsIn = labels.get(input.toLowerCase())?.decimals;
  const decimalsOut = labels.get(output.toLowerCase())?.decimals;
  if (!route.rate || decimalsIn == null || decimalsOut == null) return null;
  const [from, to] = mode === "exactOutput" ? [output, input] : [input, output];
  const rate =
    mode === "exactOutput"
      ? formatCreditRate({
          amountIn: route.rate.amountOut,
          amountOut: route.rate.amountIn,
          decimalsIn: decimalsOut,
          decimalsOut: decimalsIn,
          locale,
        })
      : formatCreditRate({
          amountIn: route.rate.amountIn,
          amountOut: route.rate.amountOut,
          decimalsIn,
          decimalsOut,
          locale,
        });
  if (!rate) return null;
  const one = formatTokenAmountFixed("1", 0, 0, locale);
  return `${one} ${symbolOf(labels, from)} ≈ ${rate} ${symbolOf(labels, to)}`;
}

/**
 * What a route costs at the entered amount when getting, or what it pays out
 * when spending, as an estimate; the rate before an amount is priced.
 */
export function figureOf(
  route: CreditRoute,
  priced: boolean,
  mode: CreditQuoteMode,
  labels: Labels,
  locale: string,
): string | null {
  const vouchers = creditRouteVouchers(route);
  const counted =
    mode === "exactOutput"
      ? { voucher: vouchers[0]!, raw: route.amountIn }
      : { voucher: vouchers.at(-1)!, raw: route.amountOut };
  const amount =
    priced && counted.raw ? amountOf(labels, counted.voucher, counted.raw, locale) : null;
  if (amount) return `≈ ${amount} ${symbolOf(labels, counted.voucher)}`;
  return rateOf(route, mode, labels, locale);
}
