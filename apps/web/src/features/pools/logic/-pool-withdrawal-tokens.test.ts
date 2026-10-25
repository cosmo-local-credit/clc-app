import type { AccountToken } from "@clc/api/features/accounts/client";
import { expect, it } from "vite-plus/test";
import { poolWithdrawalTokens } from "./pool-withdrawal-tokens";

function holding(address: string, catalogActive?: boolean): AccountToken {
  return {
    id: 1,
    tokenAddress: address,
    tokenName: "Held voucher",
    tokenSymbol: "HELD",
    tokenDecimals: 6,
    balance: "100",
    iconUrl: null,
    lastDateBlock: "2026-10-25T12:00:00Z",
    catalogActive,
  };
}

it("retains retired and unlisted holdings for withdrawal and deduplicates addresses", () => {
  const retired = holding("0x1111111111111111111111111111111111111111", false);
  const unlisted = holding("0xabcdef0000000000000000000000000000000000");
  const [catalogVoucher] = poolWithdrawalTokens([], [retired], 100);
  expect(catalogVoucher).toBeDefined();
  const tokens = poolWithdrawalTokens(
    [catalogVoucher!],
    [
      retired,
      unlisted,
      { ...unlisted, tokenAddress: unlisted.tokenAddress.toUpperCase().replace("0X", "0x") },
    ],
    100,
  );
  expect(tokens).toHaveLength(2);
  expect(tokens[0]).toBe(catalogVoucher);
  expect(tokens[0]?.active).toBe(false);
  expect(tokens[1]).toMatchObject({
    tokenAddress: unlisted.tokenAddress,
    decimals: 6,
    isAllowed: false,
    chainId: 100,
  });
});

it("does not make a withdrawal target from an invalid indexed address", () => {
  expect(poolWithdrawalTokens([], [holding("not-an-address")], 100)).toEqual([]);
});
