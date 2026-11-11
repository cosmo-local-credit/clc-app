import type { AccountToken } from "@clc/api/features/accounts/client";
import { describe, expect, it } from "vite-plus/test";

import { accountTokenToWalletToken } from "./account-token-display";

const token: AccountToken = {
  id: 1,
  tokenAddress: "0x1111111111111111111111111111111111111111",
  tokenSymbol: "X",
  tokenName: "Voucher X",
  tokenDecimals: 6,
  balance: "15300000",
  iconUrl: null,
  lastDateBlock: "2026-10-01T00:00:00Z",
};

describe("accountTokenToWalletToken", () => {
  it("restates the balance at the voucher's stated rate", () => {
    const row = accountTokenToWalletToken({ ...token, voucherValue: "10", voucherUoa: "KES" });
    expect(row.amount).toBe("15.3");
    expect(row.unitValue).toEqual({ value: "153", unit: "KES" });
  });

  it("keeps an 18-decimal balance exact", () => {
    const row = accountTokenToWalletToken({
      ...token,
      tokenDecimals: 18,
      balance: "1234567890123456789",
      voucherValue: "2.5",
      voucherUoa: "Hours",
    });
    expect(row.unitValue).toEqual({ value: "3.0864197253086419725", unit: "Hours" });
  });

  it("has no value without a usable rate, as from a backend that sends none", () => {
    expect(accountTokenToWalletToken(token).unitValue).toBeNull();
    expect(
      accountTokenToWalletToken({ ...token, voucherValue: null, voucherUoa: null }).unitValue,
    ).toBeNull();
    expect(
      accountTokenToWalletToken({ ...token, voucherValue: "0", voucherUoa: "KES" }).unitValue,
    ).toBeNull();
    expect(
      accountTokenToWalletToken({ ...token, voucherValue: "10", voucherUoa: " " }).unitValue,
    ).toBeNull();
  });
});
