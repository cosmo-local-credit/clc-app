import type { AccountActivityItem } from "@clc/api/features/accounts/client";
import { describe, expect, it } from "vite-plus/test";
import { poolActivityFromAccount } from "./pool-activity";

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

  it.each([
    ["withdrawn", "withdrawal"],
    ["fee_withdrawn", "fee-withdrawal"],
    ["pool_payout", "payout"],
  ] as const)("preserves %s instead of guessing its method", (kind, expected) => {
    const entry = poolActivityFromAccount(
      {
        ...direct,
        kind,
        direction: "OUT",
        senderAddress: pool,
        recipientAddress: recipient,
        counterpartyAddress: recipient,
        initiatorAddress: kind === "withdrawn" ? owner : undefined,
      },
      pool,
    );
    expect(entry.kind).toBe(expected);
    expect(entry.detail.senderAddress).toBe(pool);
    expect(entry.detail.recipientAddress).toBe(recipient);
    expect(entry.initiatorAddress).toBe(kind === "withdrawn" ? owner : undefined);
  });

  it("keeps issuance separate from deposits", () => {
    expect(poolActivityFromAccount({ ...direct, kind: "creation" }, pool).kind).toBe("mint");
  });
});
