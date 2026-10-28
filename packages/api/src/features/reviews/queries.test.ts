import { describe, expect, it } from "vite-plus/test";

import { reviewKeys } from "./queries";

describe("review query keys", () => {
  it("isolates resource kind, address, star filter, and viewer", () => {
    const voucher = { kind: "voucher" as const, address: "0xABC" };
    const pool = { kind: "pool" as const, address: "0xABC" };
    expect(reviewKeys.public(voucher)).toEqual(reviewKeys.public({ ...voucher, address: "0xabc" }));
    expect(reviewKeys.public(voucher)).not.toEqual(reviewKeys.public(pool));
    expect(reviewKeys.public(voucher, 5)).not.toEqual(reviewKeys.public(voucher, 4));
    expect(reviewKeys.access(pool, "0xAlice")).not.toEqual(reviewKeys.access(pool, "0xBob"));
    expect(reviewKeys.public(pool).slice(0, reviewKeys.resource(pool).length)).toEqual([
      ...reviewKeys.resource(pool),
    ]);
  });
});
