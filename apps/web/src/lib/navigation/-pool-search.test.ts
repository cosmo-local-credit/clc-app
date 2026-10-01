import { describe, expect, it } from "vite-plus/test";

import { canonicalPoolRedirectSearch, parsePoolOutputVoucher, pickPoolSearch } from "./pool-search";

const ADDRESS = "0xd524d0ed7bc970185ed9c6c9a65a8a02e8897363";

describe("pool output voucher search", () => {
  it("picks the pool-only parameter beside catalog filters", () => {
    expect(pickPoolSearch({ q: "food", out_voucher: ADDRESS, ignored: "value" })).toEqual({
      q: "food",
      out_voucher: ADDRESS,
    });
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
