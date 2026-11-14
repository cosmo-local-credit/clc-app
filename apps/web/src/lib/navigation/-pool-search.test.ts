import { describe, expect, it } from "vite-plus/test";

import {
  canonicalCreditSearch,
  canonicalPoolRedirectSearch,
  nextCreditDepth,
  parseCreditDepth,
  parsePoolCredit,
  parsePoolOutputVoucher,
  pickPoolSearch,
  withCreditDepth,
} from "./pool-search";

const ADDRESS = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";

describe("pool output voucher search", () => {
  it("picks the pool-only parameter beside catalog filters", () => {
    expect(
      pickPoolSearch({
        q: "food",
        out_voucher: ADDRESS,
        creditDepth: 2,
        creditable: "true",
        ignored: "value",
      }),
    ).toEqual({ q: "food", out_voucher: ADDRESS, creditDepth: 2, creditable: "true" });
  });

  it("accepts one address and canonicalizes its case", () => {
    expect(parsePoolOutputVoucher(ADDRESS.toUpperCase().replace("0X", "0x"))).toEqual({
      ok: true,
      address: ADDRESS,
    });
  });

  it("rejects malformed and repeated values", () => {
    expect(parsePoolOutputVoucher("not-an-address")).toEqual({ ok: false });
    expect(parsePoolOutputVoucher([ADDRESS, ADDRESS])).toEqual({ ok: false });
  });

  it("removes an empty value and preserves other filters", () => {
    expect(canonicalPoolRedirectSearch({ q: "food", out_voucher: "  " })).toEqual({
      q: "food",
      out_voucher: undefined,
    });
  });

  it("canonicalizes the voucher and catalog state together", () => {
    expect(
      canonicalPoolRedirectSearch({
        q: "  food  ",
        out_voucher: ADDRESS.toUpperCase().replace("0X", "0x"),
      }),
    ).toEqual({
      q: "food",
      tags: undefined,
      tagMatch: undefined,
      vouchers: undefined,
      voucherMatch: undefined,
      out_voucher: ADDRESS,
    });
  });

  it("leaves an invalid value visible for the page to reject safely", () => {
    expect(canonicalPoolRedirectSearch({ out_voucher: "invalid" })).toBeNull();
  });
});

describe("Credit depth search", () => {
  it.each([
    [undefined, { ok: true, depth: null }],
    ["", { ok: true, depth: null }],
    [1, { ok: true, depth: 1 }],
    [2, { ok: true, depth: 2 }],
    [" 1 ", { ok: true, depth: 1 }],
    ["2", { ok: true, depth: 2 }],
  ] as const)("parses %j", (value, expected) => {
    expect(parseCreditDepth(value)).toEqual(expected);
  });

  it.each([[0], [3], ["two"], ["true"], [[1, 2]], [1.5]] as const)(
    "rejects unsupported or repeated depth %j",
    (value) => {
      expect(parseCreditDepth(value as never)).toEqual({ ok: false });
    },
  );

  it("cycles OFF, one hop, two hops and back to OFF", () => {
    expect(nextCreditDepth(null)).toBe(1);
    expect(nextCreditDepth(1)).toBe(2);
    expect(nextCreditDepth(2)).toBeUndefined();
    expect(withCreditDepth(2)).toEqual({ creditDepth: 2, creditable: undefined });
  });

  it("reads a legacy creditable link as depth 1 on, or off", () => {
    expect(parsePoolCredit({ creditable: true })).toEqual({ ok: true, depth: 1 });
    expect(parsePoolCredit({ creditable: " TRUE " })).toEqual({ ok: true, depth: 1 });
    expect(parsePoolCredit({ creditable: "false" })).toEqual({ ok: true, depth: null });
    expect(parsePoolCredit({ creditable: "yes" })).toEqual({ ok: false });
    // A depth wins over the legacy flag.
    expect(parsePoolCredit({ creditDepth: 2, creditable: "false" })).toEqual({
      ok: true,
      depth: 2,
    });
  });

  it("normalizes legacy links to creditDepth while preserving other filters", () => {
    expect(canonicalPoolRedirectSearch({ q: "food", creditable: "true" })).toEqual({
      q: "food",
      creditDepth: 1,
      creditable: undefined,
    });
    expect(canonicalPoolRedirectSearch({ out_voucher: ADDRESS, creditable: false })).toEqual({
      out_voucher: ADDRESS,
      creditDepth: undefined,
      creditable: undefined,
    });
    expect(canonicalPoolRedirectSearch({ q: "food", creditDepth: "2" })).toEqual({
      q: "food",
      creditDepth: 2,
      creditable: undefined,
    });
    expect(canonicalCreditSearch({ creditDepth: 1 })).toBeNull();
    expect(canonicalCreditSearch({})).toBeNull();
  });

  it("leaves an invalid depth or legacy value visible for the page to reject", () => {
    expect(canonicalPoolRedirectSearch({ creditDepth: "3" })).toBeNull();
    // A malformed legacy flag becomes an invalid depth, which still blocks results.
    expect(canonicalPoolRedirectSearch({ creditable: "yes" })).toEqual({
      creditDepth: "invalid",
      creditable: undefined,
    });
    expect(parseCreditDepth("invalid")).toEqual({ ok: false });
    expect(pickPoolSearch({ creditDepth: { x: 1 } }).creditDepth).toEqual(["__invalid__"]);
    expect(parseCreditDepth(pickPoolSearch({ creditDepth: [1, 2] }).creditDepth)).toEqual({
      ok: false,
    });
  });
});
