import type { AccountToken } from "@clc/api/features/accounts/client";
import type { UserPool } from "@clc/api/features/pools/client";
import { POOL_SEAL_FEE_ADDRESS } from "@clc/core/features/pool-admin/logic";
import type { Client } from "viem";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const actions = vi.hoisted(() => ({
  readContract: vi.fn(),
  simulateContract: vi.fn(),
  call: vi.fn(),
  getBalance: vi.fn(),
}));
vi.mock("viem/actions", () => actions);
const { preparePoolOwnershipTransfer } = vi.hoisted(() => ({
  preparePoolOwnershipTransfer: vi.fn(),
}));
vi.mock("#/features/pools/hooks/use-pool-ownership-transfer", () => ({
  preparePoolOwnershipTransfer,
}));

import { discoverRotationAssets } from "./discover-rotation-assets";

const FROM = "0x8fd379246834eac74B8419FfdA202CF8051F7A03" as const;
const TO = "0x6a347bA6B1eC10348478377c5fCeE7Ceb6921A69" as const;
const SAFE = "0x2222222222222222222222222222222222222222" as const;
const POOL = "0x3333333333333333333333333333333333333333" as const;
const OWNED = "0x4444444444444444444444444444444444444444" as const;
const SAFE_OWNED = "0x5555555555555555555555555555555555555555" as const;
const EXPIRED = "0x6666666666666666666666666666666666666666" as const;
const STABLE = "0x7777777777777777777777777777777777777777" as const;
const client = { chain: { nativeCurrency: { symbol: "xDAI" } } } as unknown as Client;

function token(address: string, symbol: string): AccountToken {
  return {
    id: 1,
    tokenAddress: address,
    tokenSymbol: symbol,
    tokenName: symbol,
    tokenDecimals: 6,
    balance: "0",
    iconUrl: null,
    lastDateBlock: "",
  };
}

const pool = { address: POOL, name: "Market pool", ownerAddress: FROM } as unknown as UserPool;

function chain(options: { sealState?: number; failingCall?: string } = {}) {
  actions.readContract.mockImplementation(
    async (
      _client: Client,
      { address, functionName }: { address: string; functionName: string },
    ) => {
      if (functionName === "feeAddress") return FROM;
      if (functionName === "sealState") return options.sealState ?? 0;
      if (functionName === "owner") return address === SAFE_OWNED ? SAFE : FROM;
      if (functionName === "balanceOf") return address === OWNED ? 0n : 5n;
      throw new Error(`unexpected read ${functionName}`);
    },
  );
  actions.simulateContract.mockImplementation(
    async (_client: Client, { address }: { address: string }) => {
      if (address === STABLE) throw new Error("no applyExpiry");
      return { result: address === EXPIRED ? 1 : 0 };
    },
  );
  actions.call.mockImplementation(async (_client: Client, { to }: { to: string }) => {
    if (to === options.failingCall) throw new Error("reverted");
    return { data: "0x" };
  });
  actions.getBalance.mockResolvedValue(0n);
  preparePoolOwnershipTransfer.mockResolvedValue([{ to: POOL, value: "0", data: "0x01" }]);
}

afterEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
  preparePoolOwnershipTransfer.mockReset();
});

describe("discoverRotationAssets", () => {
  it("moves only what the old wallet owns alone and can still move", async () => {
    chain();
    const { groups, skipped } = await discoverRotationAssets({
      client,
      from: FROM,
      to: TO,
      pools: [pool],
      vouchers: [token(OWNED, "OWN"), token(SAFE_OWNED, "SAFE")],
      holdings: [token(EXPIRED, "OLD"), token(STABLE, "USD")],
    });

    expect(groups.map((group) => [group.kind, group.address])).toEqual([
      ["pool", POOL],
      ["voucher", OWNED],
      // A Safe-owned voucher's ownership stays, but a balance the card holds moves.
      ["balance", STABLE],
      ["balance", SAFE_OWNED],
    ]);
    // A creator's fee address moves with the pool, first.
    expect(groups[0]?.calls).toHaveLength(2);
    expect(skipped).toEqual([
      { kind: "balance", address: EXPIRED, label: "OLD", reason: "expired" },
    ]);
  });

  it("reports a sealed fee address and an asset that would revert", async () => {
    chain({ sealState: POOL_SEAL_FEE_ADDRESS, failingCall: OWNED });
    const { groups, skipped } = await discoverRotationAssets({
      client,
      from: FROM,
      to: TO,
      pools: [pool],
      vouchers: [token(OWNED, "OWN")],
      holdings: [],
    });

    expect(groups.map((group) => group.address)).toEqual([POOL]);
    expect(groups[0]?.calls).toHaveLength(1);
    expect(skipped.map((asset) => [asset.address, asset.reason])).toEqual([
      [POOL, "sealed-fee-address"],
      [OWNED, "would-fail"],
    ]);
  });
});
