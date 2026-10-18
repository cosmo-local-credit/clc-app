import { describe, expect, it } from "vite-plus/test";
import type { AccountToken } from "@clc/api/features/accounts/client";
import type { OwnedVoucher } from "@clc/api/features/vouchers/owned-client";
import { groupWalletVouchers } from "./owned-voucher-groups";

const OWNER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d" as const;
const OWNED = "0x1111111111111111111111111111111111111111" as const;
const HELD = "0x2222222222222222222222222222222222222222" as const;

function ownedVoucher(overrides: Partial<OwnedVoucher> = {}): OwnedVoucher {
  return {
    id: "1",
    chainId: 100,
    address: OWNED,
    name: "Owned voucher",
    symbol: "OWN",
    decimals: 6,
    iconUrl: null,
    ownerAddress: OWNER,
    active: true,
    ...overrides,
  };
}

function accountToken(address: string, balance = "2500000"): AccountToken {
  return {
    id: 2,
    tokenAddress: address,
    tokenName: "Indexed name",
    tokenSymbol: "IDX",
    tokenDecimals: 6,
    balance,
    iconUrl: null,
    lastDateBlock: "2026-10-18T00:00:00Z",
  };
}

describe("groupWalletVouchers", () => {
  it("keeps an owned voucher with no positive balance and assigns zero only after completion", () => {
    expect(groupWalletVouchers([ownedVoucher()], [], "loading").owned[0]).toMatchObject({
      amount: "0",
      balance: undefined,
      balanceState: "loading",
    });
    expect(groupWalletVouchers([ownedVoucher()], [], "complete").owned[0]).toMatchObject({
      amount: "0",
      balance: "0",
      balanceState: "ready",
    });
  });

  it("preserves an exact positive balance without duplicating it under Holdings", () => {
    const groups = groupWalletVouchers(
      [ownedVoucher()],
      [accountToken(OWNED), accountToken(HELD)],
      "complete",
    );
    expect(groups.owned[0]).toMatchObject({ amount: "2.5", balance: "2500000" });
    expect(groups.holdings.map((token) => token.contractAddress)).toEqual([HELD]);
  });

  it("keeps retired owned vouchers while excluding retired non-owned holdings", () => {
    const groups = groupWalletVouchers(
      [ownedVoucher({ active: false })],
      [
        { ...accountToken(OWNED), catalogActive: false },
        { ...accountToken(HELD), catalogActive: false },
      ],
      "complete",
    );
    expect(groups.owned[0]?.catalogActive).toBe(false);
    expect(groups.holdings).toEqual([]);
  });

  it("does not invent zero when the complete balance request failed", () => {
    expect(groupWalletVouchers([ownedVoucher()], [], "unavailable").owned[0]).toMatchObject({
      balance: undefined,
      balanceState: "unavailable",
    });
  });
});
