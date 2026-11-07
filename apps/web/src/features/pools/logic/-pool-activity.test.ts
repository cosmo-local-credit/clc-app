import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { describe, expect, it } from "vite-plus/test";
import { countSwapsSince, poolActivityFromAccount } from "./pool-activity";

const pool = "0x1111111111111111111111111111111111111111";
const owner = "0x2222222222222222222222222222222222222222";
const recipient = "0x3333333333333333333333333333333333333333";
const leg = {
  tokenAddress: "token-a",
  tokenSymbol: "A",
  tokenName: "Voucher A",
  tokenDecimals: 18,
  amount: "1606938044258990275541962092341162602522202993782792835301499",
};
const direct = {
  id: 42,
  kind: "deposited",
  direction: "IN",
  txHash: "0xtx",
  dateBlock: "2026-10-22T12:00:00Z",
  success: true,
  transfer: leg,
  senderAddress: owner,
  recipientAddress: pool,
  counterpartyAddress: owner,
  hasNote: false,
} satisfies AccountActivityItem;

describe("server-classified pool activity", () => {
  it("keeps the pool's deposit direction and exact amount", () => {
    const entry = poolActivityFromAccount(direct, pool);
    expect(entry.kind).toBe("transfer");
    if (entry.kind !== "transfer") throw new Error("expected deposit movement");
    expect(entry.direction).toBe("IN");
    expect(entry.leg.amount).toBe(leg.amount);
  });

  it("uses a single complete swap without pairing rows across pages", () => {
    const item: AccountActivityItem = {
      id: 99,
      kind: "swapped",
      txHash: "0xtx",
      dateBlock: direct.dateBlock,
      success: true,
      sent: { ...leg, tokenSymbol: "B", tokenAddress: "token-b", amount: "9" },
      received: { ...leg, amount: "10" },
      protocolFee: { ...leg, tokenAddress: "token-b", tokenSymbol: "B", amount: "1" },
      poolAddresses: [pool],
      initiatorAddress: owner,
      counterpartyAddress: owner,
      senderAddress: owner,
      recipientAddress: recipient,
    };
    const entry = poolActivityFromAccount(item, pool);
    expect(entry.kind).toBe("swap");
    if (entry.kind !== "swap") throw new Error("expected swap");
    expect(entry.sent.amount).toBe("9");
    expect(entry.received.amount).toBe("10");
    expect(entry.protocolFee?.amount).toBe("1");
    expect(entry.detail.recipientAddress).toBe(recipient);
    expect(entry.initiatorAddress).toBe(owner);
  });

  it("preserves pool_payout instead of guessing its method", () => {
    const entry = poolActivityFromAccount(
      {
        ...direct,
        kind: "pool_payout",
        direction: "OUT",
        senderAddress: pool,
        recipientAddress: recipient,
        counterpartyAddress: recipient,
      },
      pool,
    );
    expect(entry.kind).toBe("payout");
    expect(entry.detail.senderAddress).toBe(pool);
    expect(entry.detail.recipientAddress).toBe(recipient);
    expect(entry.initiatorAddress).toBeUndefined();
    if (entry.kind === "swap" || entry.kind === "mint") throw new Error("expected direct movement");
    expect(entry.leg.amount).toBe(leg.amount);
  });

  it("keeps issuance separate from deposits", () => {
    expect(poolActivityFromAccount({ ...direct, kind: "creation" }, pool).kind).toBe("mint");
  });
});

describe("countSwapsSince", () => {
  const since = new Date("2026-09-01T00:00:00Z");
  const swapAt = (id: number, dateBlock: string): AccountActivityItem => ({
    id,
    kind: "swapped",
    txHash: `0xswap${id}`,
    dateBlock,
    success: true,
    sent: { ...leg, tokenSymbol: "B", tokenAddress: "token-b", amount: "9" },
    received: { ...leg, amount: "10" },
    poolAddresses: [pool],
    initiatorAddress: owner,
    counterpartyAddress: owner,
    senderAddress: owner,
    recipientAddress: recipient,
  });
  const entries = (items: AccountActivityItem[]) =>
    items.map((item) => poolActivityFromAccount(item, pool));

  it("counts swaps inside the window, not deposits", () => {
    const rows = entries([
      swapAt(4, "2026-09-10T00:00:00Z"),
      { ...direct, id: 3, dateBlock: "2026-09-05T00:00:00Z" },
      swapAt(2, "2026-09-02T00:00:00Z"),
      swapAt(1, "2026-08-20T00:00:00Z"),
    ]);

    expect(countSwapsSince(rows, since, true)).toEqual({ count: 2, complete: true });
  });

  it("is incomplete while more history may still fall inside the window", () => {
    const rows = entries([swapAt(1, "2026-09-10T00:00:00Z")]);

    expect(countSwapsSince(rows, since, true)).toEqual({ count: 1, complete: false });
    expect(countSwapsSince(rows, since, false)).toEqual({ count: 1, complete: true });
  });
});
