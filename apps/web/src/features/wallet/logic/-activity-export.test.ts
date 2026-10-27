import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { describe, expect, it } from "vite-plus/test";

import {
  activityCsv,
  activityRangeStart,
  activityVouchers,
  filterActivityRows,
} from "./activity-export";

const KFP = "0x3fA1000000000000000000000000000000000c92";
const USDC = "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0";
const leg = (tokenAddress: string, tokenSymbol: string, amount: string) => ({
  tokenAddress,
  tokenName: tokenSymbol,
  tokenSymbol,
  tokenDecimals: 6,
  amount,
});

const received: AccountActivityItem = {
  kind: "received",
  id: 1,
  txHash: "0xaa",
  dateBlock: "2026-10-26T09:41:00Z",
  success: true,
  transfer: leg(KFP, "KFP", "1000500000"),
  senderAddress: "0x01",
  recipientAddress: "0x02",
  counterpartyAddress: "0x01",
  hasNote: false,
};
const swap: AccountActivityItem = {
  kind: "swapped",
  id: 2,
  txHash: "0xbb",
  dateBlock: "2026-08-01T00:00:00Z",
  success: false,
  sent: leg(USDC, "US,DC", "20000000"),
  received: leg(KFP, "KFP", "1"),
  poolAddresses: ["0x05"],
};

describe("activity export", () => {
  it("filters loaded rows by voucher on either swap leg and by date window", () => {
    const now = Date.parse("2026-10-27T00:00:00Z");
    expect(filterActivityRows([received, swap], { voucher: USDC, start: null })).toEqual([swap]);
    expect(filterActivityRows([received, swap], { start: activityRangeStart("30d", now) })).toEqual(
      [received],
    );
    expect(activityRangeStart(undefined, now)).toBeNull();
    expect(activityVouchers([received, swap])).toEqual([
      { address: KFP, symbol: "KFP" },
      { address: USDC, symbol: "US,DC" },
    ]);
  });

  it("writes exact amounts and quotes cells that need it", () => {
    expect(activityCsv([received, swap]).split("\r\n")).toEqual([
      "date,type,status,sent_amount,sent_token,received_amount,received_token,counterparty,tx_hash",
      "2026-10-26T09:41:00Z,received,confirmed,,,1000.5,KFP,0x01,0xaa",
      '2026-08-01T00:00:00Z,swapped,failed,20,"US,DC",0.000001,KFP,0x05,0xbb',
    ]);
  });
});
