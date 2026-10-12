import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { PoolActivityEntry, PoolTransfer } from "#/features/pools/logic/pool-activity";
import { PoolActivityDetailsSheet } from "./pool-activity-details-sheet";

const { usePoolSwapSettlement } = vi.hoisted(() => ({ usePoolSwapSettlement: vi.fn() }));

vi.mock("#/features/pools/hooks/use-pool-swap-settlement", () => ({
  usePoolSwapSettlement,
}));

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
  beforeEach(() => {
    usePoolSwapSettlement.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: () => Promise.resolve(),
    });
  });

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
    render(
      <PoolActivityDetailsSheet poolAddress={POOL} entry={entry} open onOpenChange={() => {}} />,
    );

    expect(screen.getByText(title)).toBeTruthy();
  });

  it("shows the confirmed fee split and effective percentages for a swap", () => {
    usePoolSwapSettlement.mockReturnValue({
      data: {
        source: "settlement",
        breakdown: {
          grossAmountOutRaw: "50000000",
          poolFeeRaw: "1000000",
          protocolFeeRaw: "100000",
          totalFeeRaw: "1100000",
        },
      },
      isPending: false,
      isError: false,
      refetch: () => Promise.resolve(),
    });
    const entry: PoolActivityEntry = {
      ...base,
      kind: "swap",
      counterpartyAddress: TRADER,
      received: leg,
      sent: { ...leg, tokenSymbol: "SAR", tokenName: "Sarafu" },
      protocolFee: { ...leg, tokenSymbol: "SAR", tokenName: "Sarafu", amount: "100000" },
    };

    render(
      <PoolActivityDetailsSheet poolAddress={POOL} entry={entry} open onOpenChange={() => {}} />,
    );

    expect(screen.getByText("Pool fee").parentElement?.textContent).toContain("1.00 SAR2.00%");
    expect(screen.getByText("Protocol fee").parentElement?.textContent).toContain("0.10 SAR0.20%");
    expect(screen.getByText("Total fees").parentElement?.textContent).toContain("1.10 SAR2.20%");
  });

  it("shows both historical voucher values without recalculating them", () => {
    const entry: PoolActivityEntry = {
      ...base,
      kind: "swap",
      counterpartyAddress: TRADER,
      received: { ...leg, uoaValue: "1.25", uoa: "KES" },
      sent: {
        ...leg,
        tokenSymbol: "SAR",
        tokenName: "Sarafu",
        uoaValue: "2.5",
        uoa: "USD",
      },
      protocolFee: null,
    };

    render(
      <PoolActivityDetailsSheet poolAddress={POOL} entry={entry} open onOpenChange={() => {}} />,
    );

    expect(screen.getByText("+1 KAW (1.25 KES)")).toBeTruthy();
    expect(screen.getByText("−1 SAR (2.5 USD)")).toBeTruthy();
  });
});
