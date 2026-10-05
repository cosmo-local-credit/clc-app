import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import type { PoolActivityEntry, PoolTransfer } from "#/features/pools/logic/pool-activity";
import { PoolActivityDetailsSheet } from "./pool-activity-details-sheet";

const TRADER = "0x1111111111111111111111111111111111111111";
const POOL = "0xdD97a5282D11e55d7271d466C80963d6793B276f";

const detail: PoolTransfer = {
  id: 1,
  txHash: "0xtx1",
  dateBlock: "2026-09-01T10:00:00Z",
  direction: "IN",
  counterpartyAddress: TRADER,
  senderAddress: TRADER,
  recipientAddress: POOL,
  tokenAddress: "0xAAA0000000000000000000000000000000000001",
  tokenSymbol: "KAW",
  tokenName: "Kawangware",
  tokenDecimals: 6,
  amount: "1000000",
  success: true,
  hasNote: false,
};

const leg = {
  tokenAddress: detail.tokenAddress,
  tokenSymbol: "KAW",
  tokenName: "Kawangware",
  tokenDecimals: 6,
  amount: "1000000",
};

const base = { key: "0xtx1", txHash: "0xtx1", dateBlock: detail.dateBlock, success: true, detail };

describe("PoolActivityDetailsSheet", () => {
  it.each<[string, PoolActivityEntry]>([
    [
      "Swap",
      {
        ...base,
        kind: "swap",
        counterpartyAddress: TRADER,
        received: leg,
        sent: { ...leg, tokenSymbol: "SAR", tokenName: "Sarafu" },
        protocolFee: null,
      },
    ],
    ["Created", { ...base, kind: "mint", leg }],
    ["Deposit", { ...base, kind: "transfer", direction: "IN", counterpartyAddress: TRADER, leg }],
    ["Paid out", { ...base, kind: "transfer", direction: "OUT", counterpartyAddress: TRADER, leg }],
  ])("titles the sheet %s", (title, entry) => {
    render(<PoolActivityDetailsSheet entry={entry} open onOpenChange={() => {}} />);

    expect(screen.getByText(title)).toBeTruthy();
  });
});
