import { describe, expect, it } from "vite-plus/test";

import {
  canonicalEnteredAmount,
  exceedsSwapBalance,
  fixedEnteredAmount,
  formatSwapRate,
  isPositiveRawAmount,
  poolSwapNotice,
  poolSwapReceiptSearch,
  quoteFingerprint,
  receiptTokenAmount,
  recheckSwapQuote,
  sanitizeSwapAmount,
  swapUnitValue,
} from "./pool-swap-form";

const SEND = "0x2222222222222222222222222222222222222222";
const RECEIVE = "0x3333333333333333333333333333333333333333";

const fees = {
  grossAmountOutRaw: "51000000",
  poolFeeRaw: "600000",
  protocolFeeRaw: "400000",
  totalFeeRaw: "1000000",
};
const reviewed = { amountInRaw: "25000000", amountOutRaw: "50000000", feeBreakdown: fees };

describe("sanitizeSwapAmount", () => {
  it("keeps digits and the first decimal point, at most two places", () => {
    expect(sanitizeSwapAmount("12.345")).toBe("12.34");
    expect(sanitizeSwapAmount("1.2.3")).toBe("1.23");
    expect(sanitizeSwapAmount(".5")).toBe(".5");
    expect(sanitizeSwapAmount("7.")).toBe("7.");
  });

  it("drops grouping, signs, letters and spaces", () => {
    expect(sanitizeSwapAmount("1,000.50")).toBe("1000.50");
    expect(sanitizeSwapAmount("-3 KES")).toBe("3");
    expect(sanitizeSwapAmount("abc")).toBe("");
  });
});

describe("canonicalEnteredAmount", () => {
  it("restates a typed amount at the voucher's full precision", () => {
    expect(canonicalEnteredAmount("1.5", 6)).toBe("1.5");
    expect(canonicalEnteredAmount("10", 6)).toBe("10");
  });

  it("has no amount for an empty, unsizable or unparseable entry", () => {
    expect(canonicalEnteredAmount("", 6)).toBeNull();
    expect(canonicalEnteredAmount("1.5", null)).toBeNull();
    expect(canonicalEnteredAmount(".", 6)).toBeNull();
    expect(canonicalEnteredAmount("1.234", 2)).toBeNull();
  });
});

describe("fixedEnteredAmount", () => {
  it("settles a typed amount at two places, grouped only when a locale is given", () => {
    expect(fixedEnteredAmount("1", 6)).toBe("1.00");
    expect(fixedEnteredAmount("10000.5", 6)).toBe("10000.50");
    expect(fixedEnteredAmount("10000.5", 6, "en")).toBe("10,000.50");
  });

  it("leaves an entry it cannot size as typed", () => {
    expect(fixedEnteredAmount("", 6)).toBe("");
    expect(fixedEnteredAmount("1.5", null)).toBe("1.5");
    expect(fixedEnteredAmount(".", 6)).toBe(".");
  });
});

describe("receiptTokenAmount", () => {
  it("keeps two places when they carry the whole raw amount", () => {
    expect(receiptTokenAmount("1000000", 6)).toBe("1.00");
    expect(receiptTokenAmount("12340000", 6)).toBe("12.34");
  });

  it("falls back to full precision rather than rounding a raw amount away", () => {
    expect(receiptTokenAmount("12345678", 6)).toBe("12.345678");
    expect(receiptTokenAmount("4000001", 6)).toBe("4.000001");
  });
});

describe("swapUnitValue", () => {
  const token = { voucherValue: "2", voucherUoa: "KES" };

  it("restates an exact amount in the voucher's unit of account", () => {
    expect(swapUnitValue(token, "1.5", "en")).toBe("3.00 KES");
  });

  it("has nothing to show without a token, an amount or a usable rate", () => {
    expect(swapUnitValue(undefined, "1.5", "en")).toBeNull();
    expect(swapUnitValue(token, null, "en")).toBeNull();
    expect(swapUnitValue({ voucherValue: null, voucherUoa: "KES" }, "1.5", "en")).toBeNull();
    expect(swapUnitValue({ voucherValue: "0", voucherUoa: "KES" }, "1.5", "en")).toBeNull();
  });
});

describe("isPositiveRawAmount", () => {
  it("is true only for a raw integer above zero", () => {
    expect(isPositiveRawAmount("1")).toBe(true);
    expect(isPositiveRawAmount("0")).toBe(false);
    expect(isPositiveRawAmount("-1")).toBe(false);
    expect(isPositiveRawAmount("1.5")).toBe(false);
    expect(isPositiveRawAmount("")).toBe(false);
  });
});

describe("formatSwapRate", () => {
  it("states one send voucher in receive vouchers across their decimals", () => {
    expect(formatSwapRate({ amountInRaw: "1000000", amountOutRaw: "2000000" }, 6, 6, "en")).toBe(
      "2.00",
    );
    expect(
      formatSwapRate({ amountInRaw: "1000000", amountOutRaw: "500000000000000000" }, 6, 18, "en"),
    ).toBe("0.50");
  });

  it("has no rate before both sides are sized or for a zero input", () => {
    expect(formatSwapRate(undefined, 6, 6, "en")).toBeNull();
    expect(formatSwapRate({ amountInRaw: "1", amountOutRaw: "2" }, null, 6, "en")).toBeNull();
    expect(formatSwapRate({ amountInRaw: "1", amountOutRaw: "2" }, 6, null, "en")).toBeNull();
    expect(formatSwapRate({ amountInRaw: "0", amountOutRaw: "2" }, 6, 6, "en")).toBeNull();
  });
});

describe("exceedsSwapBalance", () => {
  const token = { decimals: 6, balanceRaw: "12340000" };

  it("measures a typed send amount against the balance", () => {
    const base = {
      mode: "exact-input" as const,
      token,
      fromMaxAmountRaw: null,
      quotedAmountInRaw: undefined,
    };
    expect(exceedsSwapBalance({ ...base, fromAmount: "12.34" })).toBe(false);
    expect(exceedsSwapBalance({ ...base, fromAmount: "12.35" })).toBe(true);
    expect(exceedsSwapBalance({ ...base, fromAmount: "" })).toBe(false);
  });

  it("measures Max's pinned raw figure rather than its rounded display", () => {
    expect(
      exceedsSwapBalance({
        mode: "exact-input",
        token,
        fromAmount: "12.34",
        fromMaxAmountRaw: "12340001",
        quotedAmountInRaw: undefined,
      }),
    ).toBe(true);
  });

  it("measures the quoted input in exact-output mode, ignoring a stale typed send", () => {
    const base = {
      mode: "exact-output" as const,
      token,
      fromAmount: "999",
      fromMaxAmountRaw: null,
    };
    expect(exceedsSwapBalance({ ...base, quotedAmountInRaw: "12340000" })).toBe(false);
    expect(exceedsSwapBalance({ ...base, quotedAmountInRaw: "12340001" })).toBe(true);
    expect(exceedsSwapBalance({ ...base, quotedAmountInRaw: undefined })).toBe(false);
  });

  it("does not flag what it cannot size", () => {
    expect(
      exceedsSwapBalance({
        mode: "exact-output",
        token: { decimals: null, balanceRaw: "0" },
        fromAmount: "",
        fromMaxAmountRaw: null,
        quotedAmountInRaw: "1",
      }),
    ).toBe(false);
    expect(
      exceedsSwapBalance({
        mode: "exact-input",
        token,
        fromAmount: ".",
        fromMaxAmountRaw: null,
        quotedAmountInRaw: undefined,
      }),
    ).toBe(false);
    expect(
      exceedsSwapBalance({
        mode: "exact-input",
        token: undefined,
        fromAmount: "1",
        fromMaxAmountRaw: null,
        quotedAmountInRaw: undefined,
      }),
    ).toBe(false);
  });
});

describe("quoteFingerprint", () => {
  it("changes with either amount or any fee figure", () => {
    const base = quoteFingerprint(reviewed);
    expect(quoteFingerprint({ ...reviewed })).toBe(base);
    expect(quoteFingerprint({ ...reviewed, amountInRaw: "25000001" })).not.toBe(base);
    expect(quoteFingerprint({ ...reviewed, amountOutRaw: "50000001" })).not.toBe(base);
    expect(
      quoteFingerprint({ ...reviewed, feeBreakdown: { ...fees, grossAmountOutRaw: "51000001" } }),
    ).not.toBe(base);
    // The same total split differently between the pool and the protocol.
    expect(
      quoteFingerprint({
        ...reviewed,
        feeBreakdown: { ...fees, poolFeeRaw: "500000", protocolFeeRaw: "500000" },
      }),
    ).not.toBe(base);
    expect(quoteFingerprint({ ...reviewed, feeBreakdown: null })).not.toBe(base);
  });
});

describe("recheckSwapQuote", () => {
  const fresh = { ...reviewed, hasLiquidity: true, exceedsDepositCap: false };

  it("passes a refreshed quote that matches what was reviewed", () => {
    expect(recheckSwapQuote(reviewed, { isError: false, data: fresh })).toBeNull();
  });

  it("reports a failed read, then liquidity, then the deposit cap, then any moved figure", () => {
    expect(recheckSwapQuote(reviewed, { isError: true, data: fresh })).toBe("unverified");
    expect(recheckSwapQuote(reviewed, { isError: false })).toBe("unverified");
    expect(
      recheckSwapQuote(reviewed, {
        isError: false,
        data: { ...fresh, amountOutRaw: "1", hasLiquidity: false, exceedsDepositCap: true },
      }),
    ).toBe("liquidity");
    expect(
      recheckSwapQuote(reviewed, {
        isError: false,
        data: { ...fresh, amountOutRaw: "1", exceedsDepositCap: true },
      }),
    ).toBe("depositCap");
    expect(
      recheckSwapQuote(reviewed, {
        isError: false,
        data: {
          ...fresh,
          feeBreakdown: { ...fees, poolFeeRaw: "500000", protocolFeeRaw: "500000" },
        },
      }),
    ).toBe("changed");
  });
});

describe("poolSwapNotice", () => {
  const settled = {
    tokensPending: false,
    tokensError: false,
    tokenCount: 2,
    hasSwappableFrom: true,
    quote: {
      isError: false,
      isDebouncing: false,
      isPlaceholderData: false,
      data: { hasLiquidity: true, availableAmountOutRaw: "1000", depositHeadroomRaw: null },
    },
    exceedsBalance: false,
    exceedsDepositCap: false,
    sourceAmount: "1",
  };

  it("says nothing about a swap that can go ahead", () => {
    expect(poolSwapNotice(settled)).toBeNull();
  });

  it("puts the menu ahead of the quote, and the quote ahead of the amounts", () => {
    const everything = {
      ...settled,
      tokensPending: true,
      tokensError: true,
      tokenCount: 0,
      hasSwappableFrom: false,
      quote: { ...settled.quote, isError: true },
      exceedsBalance: true,
      exceedsDepositCap: true,
      sourceAmount: "0",
    };
    expect(poolSwapNotice(everything)).toEqual({ kind: "tokensPending" });
    expect(poolSwapNotice({ ...everything, tokensPending: false })).toEqual({
      kind: "tokensError",
    });
    const menuRead = { ...everything, tokensPending: false, tokensError: false };
    expect(poolSwapNotice(menuRead)).toEqual({ kind: "noTokens" });
    expect(poolSwapNotice({ ...menuRead, tokenCount: 2 })).toEqual({ kind: "nothingHeld" });
    const quoted = { ...menuRead, tokenCount: 2, hasSwappableFrom: true };
    expect(poolSwapNotice(quoted)).toEqual({ kind: "quoteError" });
    const priced = { ...quoted, quote: settled.quote };
    expect(poolSwapNotice(priced)).toEqual({ kind: "exceedsBalance" });
    expect(poolSwapNotice({ ...priced, exceedsBalance: false })).toEqual({
      kind: "depositCap",
      full: false,
    });
    expect(poolSwapNotice({ ...settled, sourceAmount: "0" })).toEqual({ kind: "nonPositive" });
  });

  it("holds a quote error back while the amount is still being typed", () => {
    expect(
      poolSwapNotice({
        ...settled,
        quote: { ...settled.quote, isError: true, isDebouncing: true },
      }),
    ).toBeNull();
  });

  it("tells a full pool from one with a little room left", () => {
    const capped = { ...settled, exceedsDepositCap: true };
    expect(
      poolSwapNotice({
        ...capped,
        quote: { ...settled.quote, data: { ...settled.quote.data, depositHeadroomRaw: "0" } },
      }),
    ).toEqual({ kind: "depositCap", full: true });
    expect(
      poolSwapNotice({
        ...capped,
        quote: { ...settled.quote, data: { ...settled.quote.data, depositHeadroomRaw: "5" } },
      }),
    ).toEqual({ kind: "depositCap", full: false });
  });

  it("reports short liquidity only on a settled quote, and whether any is left", () => {
    const short = {
      ...settled,
      quote: { ...settled.quote, data: { ...settled.quote.data, hasLiquidity: false } },
    };
    expect(poolSwapNotice(short)).toEqual({ kind: "liquidity", empty: false });
    expect(
      poolSwapNotice({
        ...short,
        quote: { ...short.quote, data: { ...short.quote.data, availableAmountOutRaw: "0" } },
      }),
    ).toEqual({ kind: "liquidity", empty: true });
    expect(poolSwapNotice({ ...short, quote: { ...short.quote, isDebouncing: true } })).toBeNull();
    expect(
      poolSwapNotice({ ...short, quote: { ...short.quote, isPlaceholderData: true } }),
    ).toBeNull();
  });

  it("asks for an amount above zero only once something is typed", () => {
    expect(poolSwapNotice({ ...settled, sourceAmount: "" })).toBeNull();
    expect(poolSwapNotice({ ...settled, sourceAmount: "  " })).toBeNull();
    expect(poolSwapNotice({ ...settled, sourceAmount: "0.00" })).toEqual({ kind: "nonPositive" });
  });
});

describe("poolSwapReceiptSearch", () => {
  const input = {
    confirmed: { amountInRaw: "25000000", amountOutRaw: "50000001" },
    send: { symbol: "TTX", token: SEND, decimals: 6 },
    receive: { symbol: "RAMBO", token: RECEIVE, decimals: 6 },
    poolName: "Trade Pool",
  } as const;

  it("carries the confirmed amounts, both tokens and the receive decimals", () => {
    expect(poolSwapReceiptSearch({ ...input, result: { trackingId: "swap-1" } })).toEqual({
      trackingId: "swap-1",
      sendAmount: "25.00",
      sendSymbol: "TTX",
      sendToken: SEND,
      receiveAmount: "50.000001",
      receiveSymbol: "RAMBO",
      receiveToken: RECEIVE,
      receiveDecimals: 6,
      poolName: "Trade Pool",
      sendUoaUnavailable: true,
      receiveUoaUnavailable: true,
    });
  });

  it("values each side from the relay's own claim for that token", () => {
    const search = poolSwapReceiptSearch({
      ...input,
      result: {
        trackingId: "swap-1",
        valuationSnapshots: [{ tokenAddress: SEND, voucherValue: "2", voucherUoa: "KES" }],
      },
    });
    expect(search).toMatchObject({ sendUoaValue: "50", sendUoa: "KES" });
    expect(search).not.toHaveProperty("sendUoaUnavailable");
    expect(search).toMatchObject({ receiveUoaUnavailable: true });
    expect(search).not.toHaveProperty("receiveUoaValue");
  });
});
