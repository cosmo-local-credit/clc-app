import { describe, expect, it } from "vite-plus/test";

import {
  canonicalCreditSearch,
  canonicalPoolRedirectSearch,
  parseCredit,
  parsePoolOutputVoucher,
  pickPoolSearch,
  withCredit,
} from "./pool-search";

const ADDRESS = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";

describe("pool output voucher search", () => {
  it("picks the pool-only parameter beside catalog filters", () => {
    expect(
      pickPoolSearch({
        q: "food",
        out_voucher: ADDRESS,
        credit: 1,
        creditDepth: 2,
        creditable: "true",
        ignored: "value",
      }),
    ).toEqual({ q: "food", out_voucher: ADDRESS, credit: 1, creditDepth: 2, creditable: "true" });
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

describe("Credit search", () => {
  it.each([
    [{}, false],
    [{ credit: 1 }, true],
    [{ credit: "1" }, true],
    [{ credit: " 1 " }, true],
    [{ credit: 0 }, false],
    [{ credit: 2 }, false],
    [{ credit: true }, false],
    [{ credit: "on" }, false],
    [{ credit: "" }, false],
    [{ credit: [1, 1] }, false],
    [{ credit: { on: 1 } }, false],
  ] as const)("reads %j as Credit %s", (search, on) => {
    expect(parseCredit(search)).toBe(on);
  });

  it.each([
    [{ creditDepth: 1 }, true],
    [{ creditDepth: "2" }, true],
    [{ creditDepth: 3 }, true],
    [{ creditDepth: "max" }, true],
    [{ creditDepth: " MAX " }, true],
    [{ creditDepth: 4 }, false],
    [{ creditDepth: 0 }, false],
    [{ creditDepth: "two" }, false],
    [{ creditDepth: [1, 2] }, false],
    [{ creditable: true }, true],
    [{ creditable: " TRUE " }, true],
    [{ creditable: false }, false],
    [{ creditable: "yes" }, false],
  ] as const)("reads the legacy link %j as Credit %s", (search, on) => {
    expect(parseCredit(search)).toBe(on);
  });

  it("lets credit decide over a legacy key, and a legacy depth over creditable", () => {
    expect(parseCredit({ credit: "x", creditDepth: 2 })).toBe(false);
    expect(parseCredit({ credit: 1, creditable: false })).toBe(true);
    expect(parseCredit({ creditDepth: 2, creditable: "false" })).toBe(true);
    expect(parseCredit({ creditDepth: "x", creditable: true })).toBe(false);
  });

  it("toggles to credit=1 or nothing, always dropping the legacy keys", () => {
    expect(withCredit(true)).toEqual({ credit: 1, creditDepth: undefined, creditable: undefined });
    expect(withCredit(false)).toEqual({
      credit: undefined,
      creditDepth: undefined,
      creditable: undefined,
    });
  });

  it.each([
    [{ creditDepth: 1 }, 1],
    [{ creditDepth: 2 }, 1],
    [{ creditDepth: 3 }, 1],
    [{ creditDepth: "max" }, 1],
    [{ creditable: true }, 1],
    [{ creditable: "true" }, 1],
    [{ creditable: false }, undefined],
    [{ creditDepth: 7 }, undefined],
    [{ credit: "1" }, 1],
    [{ credit: "yes" }, undefined],
    [{ credit: 2 }, undefined],
    [{ credit: [1, 1] }, undefined],
  ] as const)("normalizes %j to credit=%s while preserving other filters", (credit, value) => {
    expect(canonicalPoolRedirectSearch({ q: "food", ...credit })).toEqual({
      q: "food",
      credit: value,
      creditDepth: undefined,
      creditable: undefined,
    });
  });

  it("leaves canonical Credit alone", () => {
    expect(canonicalCreditSearch({ credit: 1 })).toBeNull();
    expect(canonicalCreditSearch({})).toBeNull();
    expect(canonicalPoolRedirectSearch({ q: "food", credit: 1 })).toBeNull();
    expect(canonicalPoolRedirectSearch({ out_voucher: ADDRESS, creditable: false })).toEqual({
      out_voucher: ADDRESS,
      credit: undefined,
      creditDepth: undefined,
      creditable: undefined,
    });
  });
});
