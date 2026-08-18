import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_PAGE_SIZE } from "#/lib/table-search";
import {
  parseOTXSearch,
  parsePoolTransactionsSearch,
  parseVoucherTransactionsSearch,
} from "./transactions-search";

const ADDRESS = "0x33a573149db22e759fB9A38Bcc461C12855c2645";

describe("parseVoucherTransactionsSearch", () => {
  it("keeps a known type and a whole address", () => {
    expect(parseVoucherTransactionsSearch({ type: "mint", voucher: ADDRESS })).toMatchObject({
      type: "mint",
      voucher: ADDRESS,
      perPage: DEFAULT_PAGE_SIZE,
    });
  });

  it("drops a type belonging to another page rather than sending it", () => {
    // A stale link from the pool page. clc-core answers 400 for `type=swap`
    // here, so the parser has to normalize it away rather than pass it on.
    expect(parseVoucherTransactionsSearch({ type: "swap" }).type).toBeUndefined();
  });

  it("drops a partial address, which filters nothing", () => {
    expect(parseVoucherTransactionsSearch({ voucher: "0x33a5" }).voucher).toBeUndefined();
  });
});

describe("parsePoolTransactionsSearch", () => {
  it("keeps a known type and a whole address", () => {
    expect(parsePoolTransactionsSearch({ type: "deposit", pool: ADDRESS })).toMatchObject({
      type: "deposit",
      pool: ADDRESS,
    });
  });

  it("drops a voucher type", () => {
    expect(parsePoolTransactionsSearch({ type: "burn" }).type).toBeUndefined();
  });
});

describe("parseOTXSearch", () => {
  it("keeps a known type and dispatch status", () => {
    expect(parseOTXSearch({ type: "RELAY_EXEC", status: "NO_GAS" })).toMatchObject({
      type: "RELAY_EXEC",
      status: "NO_GAS",
    });
  });

  it("is case-sensitive, since the enum is", () => {
    expect(parseOTXSearch({ type: "relay_exec" }).type).toBeUndefined();
  });

  it("drops an unknown status", () => {
    expect(parseOTXSearch({ status: "MAYBE" }).status).toBeUndefined();
  });

  it("still carries the shared table params", () => {
    expect(parseOTXSearch({ perPage: "50", cursor: "12", dir: "next" })).toMatchObject({
      perPage: 50,
      cursor: 12,
      dir: "next",
    });
  });
});
