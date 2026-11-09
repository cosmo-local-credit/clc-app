import type { RelayResult } from "@clc/api/features/relayer/client";
import {
  formatUnitOfAccountDisplayValue,
  formatVoucherUnitValue,
} from "@clc/core/features/market/logic";
import type { PoolSwapFeeBreakdownRaw } from "@clc/core/features/pool-swaps/logic";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@clc/core/features/wallet/logic";

import type { PoolSwapQuoteMode } from "#/features/pools/hooks/use-pool-swap-quote";
import { relaySnapshotUnitValue } from "#/features/wallet/logic/relay-valuation";
import type { PoolSwapToken } from "./pool-swap-tokens";

/**
 * The pool swap's pure rules, shared by the phone screen and the desktop
 * column through `usePoolSwapForm`. Nothing here formats for a layout.
 */

/** Digits and one decimal point, at most two places: what an amount box accepts. */
export function sanitizeSwapAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const whole = cleaned.slice(0, firstDot);
  const fraction = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${whole}.${fraction}`;
}

/** A typed amount at the voucher's full precision, or null if it cannot be sized. */
export function canonicalEnteredAmount(amount: string, decimals: number | null): string | null {
  if (!amount || decimals === null) return null;
  try {
    const raw = parseTokenAmount(amount, decimals);
    return formatTokenAmount(raw, decimals, decimals);
  } catch {
    return null;
  }
}

/** A typed amount at two places, as a settled field shows it; the input itself if unparseable. */
export function fixedEnteredAmount(
  amount: string,
  decimals: number | null,
  locale?: string,
): string {
  if (!amount || decimals === null) return amount;
  try {
    return formatTokenAmountFixed(parseTokenAmount(amount, decimals), decimals, 2, locale);
  } catch {
    return amount;
  }
}

/** Keep the established two-decimal receipt style unless it would lose raw precision. */
export function receiptTokenAmount(rawAmount: string, decimals: number): string {
  const fixed = formatTokenAmountFixed(rawAmount, decimals, 2);
  try {
    if (parseTokenAmount(fixed, decimals) === rawAmount) return fixed;
  } catch {
    // The exact formatter below is the safe fallback.
  }
  return formatTokenAmount(rawAmount, decimals, decimals);
}

/** An exact amount of the voucher in its unit of account, or null where it has none. */
export function swapUnitValue(
  token: Pick<PoolSwapToken, "voucherValue" | "voucherUoa"> | undefined,
  amount: string | null,
  locale: string,
): string | null {
  if (!token || amount === null) return null;
  const valuation = formatVoucherUnitValue(amount, token.voucherValue, token.voucherUoa);
  if (!valuation) return null;
  const localized = formatUnitOfAccountDisplayValue(valuation.value, locale);
  return `${localized ?? valuation.value} ${valuation.unit}`;
}

export function isPositiveRawAmount(value: string): boolean {
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

/** One send voucher in receive vouchers, at two places, or null before both sides are sized. */
export function formatSwapRate(
  quote: { amountInRaw: string; amountOutRaw: string } | undefined,
  fromDecimals: number | null,
  toDecimals: number | null,
  locale: string,
): string | null {
  if (!quote || fromDecimals === null || toDecimals === null) return null;
  const amountInRaw = BigInt(quote.amountInRaw);
  if (amountInRaw <= 0n) return null;
  const rateRaw =
    (BigInt(quote.amountOutRaw) * 10n ** BigInt(fromDecimals) * 100n) /
    (amountInRaw * 10n ** BigInt(toDecimals));
  return formatTokenAmountFixed(rateRaw.toString(), 2, 2, locale);
}

/**
 * Whether the send side asks for more than the wallet holds. In exact-output
 * mode that is the quoted input; in exact-input mode it is what was typed, or
 * the pinned raw maximum when Max filled it.
 */
export function exceedsSwapBalance(input: {
  mode: PoolSwapQuoteMode;
  token: Pick<PoolSwapToken, "decimals" | "balanceRaw"> | undefined;
  fromAmount: string;
  fromMaxAmountRaw: string | null;
  quotedAmountInRaw: string | undefined;
}): boolean {
  const { token } = input;
  if (!token) return false;
  try {
    let amountRaw: string;
    if (input.mode === "exact-output") {
      if (input.quotedAmountInRaw === undefined || token.decimals === null) return false;
      amountRaw = input.quotedAmountInRaw;
    } else {
      if (!input.fromAmount) return false;
      amountRaw =
        input.fromMaxAmountRaw ?? parseTokenAmount(input.fromAmount, token.decimals ?? 18);
    }
    return BigInt(amountRaw) > BigInt(token.balanceRaw);
  } catch {
    return false;
  }
}

type QuoteFigures = {
  amountInRaw: string;
  amountOutRaw: string;
  feeBreakdown: PoolSwapFeeBreakdownRaw | null;
};

/**
 * What the confirmation showed. Both amounts plus the gross and the two fees
 * pin everything else: the total is their sum and the delivered output is the
 * gross less it.
 */
export function quoteFingerprint(quote: QuoteFigures): string {
  const fees = quote.feeBreakdown;
  return [
    quote.amountInRaw,
    quote.amountOutRaw,
    fees?.grossAmountOutRaw,
    fees?.poolFeeRaw,
    fees?.protocolFeeRaw,
  ].join(":");
}

export type SwapQuoteRecheck = "unverified" | "liquidity" | "depositCap" | "changed";

/**
 * Why a quote read again at confirm time may not be signed, or null when it
 * matches what the holder reviewed. Checked in this order: a failed read, the
 * pool's liquidity, its deposit cap, then any figure that moved.
 */
export function recheckSwapQuote(
  reviewed: QuoteFigures,
  refreshed: {
    isError: boolean;
    data?: (QuoteFigures & { hasLiquidity: boolean; exceedsDepositCap?: boolean }) | undefined;
  },
): SwapQuoteRecheck | null {
  if (refreshed.isError || !refreshed.data) return "unverified";
  if (!refreshed.data.hasLiquidity) return "liquidity";
  if (refreshed.data.exceedsDepositCap) return "depositCap";
  if (quoteFingerprint(refreshed.data) !== quoteFingerprint(reviewed)) return "changed";
  return null;
}

/** The one line under the swap figures that says why it cannot go ahead, highest first. */
export type PoolSwapNotice =
  | { kind: "tokensPending" }
  | { kind: "tokensError" }
  | { kind: "noTokens" }
  | { kind: "nothingHeld" }
  | { kind: "quoteError" }
  | { kind: "exceedsBalance" }
  | { kind: "depositCap"; full: boolean }
  | { kind: "liquidity"; empty: boolean }
  | { kind: "nonPositive" };

export function poolSwapNotice(input: {
  tokensPending: boolean;
  tokensError: boolean;
  tokenCount: number;
  hasSwappableFrom: boolean;
  quote: {
    isError: boolean;
    isDebouncing: boolean;
    isPlaceholderData: boolean;
    data?:
      | {
          hasLiquidity: boolean;
          availableAmountOutRaw: string;
          depositHeadroomRaw?: string | null;
        }
      | undefined;
  };
  exceedsBalance: boolean;
  exceedsDepositCap: boolean;
  sourceAmount: string;
}): PoolSwapNotice | null {
  const { quote } = input;
  if (input.tokensPending) return { kind: "tokensPending" };
  if (input.tokensError) return { kind: "tokensError" };
  if (input.tokenCount === 0) return { kind: "noTokens" };
  if (!input.hasSwappableFrom) return { kind: "nothingHeld" };
  if (quote.isError && !quote.isDebouncing) return { kind: "quoteError" };
  if (input.exceedsBalance) return { kind: "exceedsBalance" };
  if (input.exceedsDepositCap) {
    return { kind: "depositCap", full: quote.data?.depositHeadroomRaw === "0" };
  }
  if (quote.data && !quote.isDebouncing && !quote.isPlaceholderData && !quote.data.hasLiquidity) {
    return { kind: "liquidity", empty: BigInt(quote.data.availableAmountOutRaw) === 0n };
  }
  if (input.sourceAmount.trim() !== "" && Number(input.sourceAmount) <= 0) {
    return { kind: "nonPositive" };
  }
  return null;
}

/**
 * The receipt route's search for a relayed swap: the amounts the refreshed
 * quote confirmed, and each side's value from the relay's own submission-time
 * claim, or an explicit "unavailable" where it made none.
 */
export function poolSwapReceiptSearch(input: {
  result: RelayResult;
  confirmed: { amountInRaw: string; amountOutRaw: string };
  send: { symbol: string; token: `0x${string}`; decimals: number };
  receive: { symbol: string; token: `0x${string}`; decimals: number };
  poolName: string;
}) {
  const { result, confirmed, send, receive } = input;
  const sendAmount = receiptTokenAmount(confirmed.amountInRaw, send.decimals);
  const receiveAmount = receiptTokenAmount(confirmed.amountOutRaw, receive.decimals);
  const sendUnitValue = relaySnapshotUnitValue(result.valuationSnapshots, send.token, sendAmount);
  const receiveUnitValue = relaySnapshotUnitValue(
    result.valuationSnapshots,
    receive.token,
    receiveAmount,
  );
  return {
    trackingId: result.trackingId,
    sendAmount,
    sendSymbol: send.symbol,
    sendToken: send.token,
    receiveAmount,
    receiveSymbol: receive.symbol,
    receiveToken: receive.token,
    // The receipt reads its fees from the settlement event, which states them
    // raw in the received voucher.
    receiveDecimals: receive.decimals,
    poolName: input.poolName,
    ...(sendUnitValue
      ? { sendUoaValue: sendUnitValue.value, sendUoa: sendUnitValue.unit }
      : { sendUoaUnavailable: true }),
    ...(receiveUnitValue
      ? { receiveUoaValue: receiveUnitValue.value, receiveUoa: receiveUnitValue.unit }
      : { receiveUoaUnavailable: true }),
  };
}
