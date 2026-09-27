import { describe, expect, it } from "vite-plus/test";

import {
  type ApprovalCandidate,
  suggestApprovalVouchers,
  toApprovalCandidate,
} from "./approval-suggestions";

const ISSUED = "0xaaa0000000000000000000000000000000000001";
const HELD = "0xbbb0000000000000000000000000000000000002";
const POOL = "0xccc0000000000000000000000000000000000003";

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
  it("lists issued, then other holdings, then the rest of the pool, once each", () => {
    const groups = suggestApprovalVouchers({
      issued: [candidate(ISSUED, "WLLR")],
      holdings: [candidate(ISSUED.toUpperCase(), "WLLR"), candidate(HELD, "SRF")],
      inPool: [candidate(HELD, "SRF"), candidate(POOL, "PEPAS"), candidate(ISSUED, "WLLR")],
    });

    expect(groups.issued.map((row) => row.symbol)).toEqual(["WLLR"]);
    expect(groups.holdings.map((row) => row.symbol)).toEqual(["SRF"]);
    expect(groups.inPool.map((row) => row.symbol)).toEqual(["PEPAS"]);
  });
});
