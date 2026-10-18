import { describe, expect, it } from "vite-plus/test";

import { partitionTokensByIssuer } from "./partition-tokens-by-issuer";

function token(id: string, catalogActive?: boolean) {
  return { id, symbol: id.slice(2, 6), catalogActive };
}

describe("partitionTokensByIssuer", () => {
  const issued = token("0xaaa0000000000000000000000000000000000001");
  const held = token("0xbbb0000000000000000000000000000000000002");
  const unknown = token("0xccc0000000000000000000000000000000000003");

  it("files every balance the account did not issue under Holdings, in balance order", () => {
    const split = partitionTokensByIssuer([held, issued, unknown], [issued]);

    expect(split.holdings.map((row) => row.id)).toEqual([held.id, unknown.id]);
    expect(split.issued.map((row) => row.id)).toEqual([issued.id]);
  });

  it("keeps an issued voucher the account holds none of", () => {
    // A failed opening mint leaves the voucher with no balance anywhere; My
    // Vouchers is the only way back to it.
    const unminted = token("0xddd0000000000000000000000000000000000004");
    const split = partitionTokensByIssuer([held], [unminted]);

    expect(split.issued).toEqual([unminted]);
    expect(split.holdings).toEqual([held]);
  });

  it("matches a balance to its issued row regardless of address casing", () => {
    const split = partitionTokensByIssuer([issued], [{ ...issued, id: issued.id.toUpperCase() }]);

    expect(split.holdings).toEqual([]);
  });

  it("hides retired vouchers from both lists", () => {
    const retired = token("0xeee0000000000000000000000000000000000005", false);
    const active = token("0xfff0000000000000000000000000000000000006", true);
    const split = partitionTokensByIssuer([retired, unknown, active], [retired, active]);

    expect(split.holdings).toEqual([unknown]);
    expect(split.issued).toEqual([active]);
  });
});
