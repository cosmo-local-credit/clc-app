import { describe, expect, it } from "vite-plus/test";

import { termFilter } from "./catalog-filter";

/**
 * These bounds are clc-core's, not a UI preference: `store.NewCatalogFilter`
 * answers `ErrCatalogTermTooShort` under two runes and `ErrCatalogTermTooLong`
 * over 64, and `/api/v2/vouchers` and `/api/v2/pools` turn either into a 400. A
 * term that reaches the client unchecked is an error block where the operator
 * expected a table.
 */
describe("termFilter", () => {
  it("holds back a one-character term, which the endpoint rejects", () => {
    expect(termFilter("P").term).toBe("");
  });

  it("sends a term from two characters up", () => {
    expect(termFilter("Po").term).toBe("Po");
  });

  it("trims and collapses whitespace so equivalent terms are one request", () => {
    expect(termFilter("  kilifi   market ").term).toBe("kilifi market");
  });

  it("counts a padded single character as too short", () => {
    expect(termFilter("   P   ").term).toBe("");
  });

  it("truncates an overlong term instead of letting it 400", () => {
    expect(termFilter("a".repeat(80)).term).toHaveLength(64);
  });

  it("carries no tag or voucher constraint", () => {
    const filter = termFilter("kilifi");
    expect(filter.tags).toEqual([]);
    expect(filter.vouchers).toEqual([]);
    expect(filter.tagMatch).toBe("any");
    expect(filter.voucherMatch).toBe("any");
  });
});
