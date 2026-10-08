import { describe, expect, it } from "vite-plus/test";

import {
  type ApprovalCandidate,
  suggestApprovalVouchers,
  toApprovalCandidate,
} from "./approval-suggestions";

const ISSUED = "0xaaa0000000000000000000000000000000000001";
const HELD = "0xbbb0000000000000000000000000000000000002";
const DEPOSITED = "0xccc0000000000000000000000000000000000003";
const APPROVED = "0xddd0000000000000000000000000000000000004";

function candidate(address: string, symbol: string): ApprovalCandidate {
  return { id: address, address: address as `0x${string}`, name: symbol, symbol };
}

describe("toApprovalCandidate", () => {
  it("keeps an addressable voucher and names a blank one after its symbol", () => {
    expect(toApprovalCandidate({ id: "1", address: ISSUED, name: "  ", symbol: " WLLR " })).toEqual(
      { id: "1", address: ISSUED, name: "WLLR", symbol: "WLLR" },
    );
    expect(
      toApprovalCandidate({ id: "1", address: "not-an-address", name: "Will", symbol: "WLLR" }),
    ).toBeNull();
    expect(
      toApprovalCandidate({ id: "1", address: ISSUED, name: "Will", symbol: "  " }),
    ).toBeNull();
  });
});

describe("suggestApprovalVouchers", () => {
  it("lists unapproved holdings, deposits, then issued vouchers once each", () => {
    const groups = suggestApprovalVouchers({
      holdings: [candidate(HELD, "SRF"), candidate(APPROVED, "OLD")],
      deposited: [
        candidate(HELD.toUpperCase(), "SRF"),
        candidate(DEPOSITED, "PEPAS"),
        candidate(APPROVED.toUpperCase(), "OLD"),
      ],
      issued: [
        candidate(DEPOSITED, "PEPAS"),
        candidate(ISSUED, "WLLR"),
        candidate(APPROVED, "OLD"),
      ],
      approvedAddresses: [APPROVED.toUpperCase()],
    });

    expect(groups.holdings.map((row) => row.symbol)).toEqual(["SRF"]);
    expect(groups.deposited.map((row) => row.symbol)).toEqual(["PEPAS"]);
    expect(groups.issued.map((row) => row.symbol)).toEqual(["WLLR"]);
  });
});
