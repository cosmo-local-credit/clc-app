import type { AccountToken } from "@clc/api/features/accounts/client";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { describe, expect, it } from "vite-plus/test";

import { buildPoolHoldings } from "./pool-holdings";

const POOL = "0xdD97a5282D11e55d7271d466C80963d6793B276f" as const;
const LIMITER = "0x4d9000000000000000000000000000000000a1c7" as const;
const KAW = "0xAAA0000000000000000000000000000000000001" as const;
const SAR = "0xBbB0000000000000000000000000000000000002" as const;

/** Parity — one unit of account per token. */
const PARITY = 1_000_000n;

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "1",
    chainId: 100,
    address: POOL,
    name: "Kawangware",
    symbol: "KAW",
    ownerAddress: null,
    feePpm: null,
    feeAddress: null,
    tokenRegistryAddress: null,
    limiterAddress: LIMITER,
    quoterAddress: null,
    quoterType: null,
    feePolicyAddress: null,
    protocolFeeControllerAddress: null,
    feesDecoupled: false,
    decimals: 6,
    description: "",
    unitOfAccount: "KSH",
    locationName: null,
    geoLat: null,
    geoLng: null,
    email: null,
    website: null,
    phone: null,
    imageUrl: null,
    bannerUrl: null,
    terms: null,
    defaultVoucherId: null,
    voucherCount: 0,
    tags: [],
    ...overrides,
  };
}

function voucher(overrides: Partial<PoolVoucher> = {}): PoolVoucher {
  return {
    id: "v1",
    chainId: 100,
    name: "Kawangware Voucher",
    description: "",
    symbol: "KAW",
    tokenAddress: KAW,
    decimals: 6,
    ownerAddress: null,
    voucherType: null,
    voucherUoa: null,
    voucherValue: null,
    locationName: null,
    iconUrl: null,
    bannerUrl: null,
    active: true,
    internal: false,
    isAllowed: true,
    tokenLimit: "200000000",
    oracleFeedId: null,
    oracleName: null,
    oracleAddress: null,
    offerCount: 0,
    availableOfferCount: 0,
    tags: [],
    ...overrides,
  };
}

function accountToken(overrides: Partial<AccountToken> = {}): AccountToken {
  return {
    id: 7,
    tokenAddress: SAR,
    tokenSymbol: "SAR",
    tokenName: "Sarafu",
    tokenDecimals: 6,
    balance: "50000000",
    iconUrl: null,
    lastDateBlock: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function treasury(balanceRaw: string, feesRaw = "0", withdrawableRaw = balanceRaw) {
  return { balanceRaw, feesRaw, withdrawableRaw };
}

describe("buildPoolHoldings", () => {
  it("prices a catalog voucher from the chain balance and the quoter's rate", () => {
    const [holding] = buildPoolHoldings({
      pool: pool(),
      vouchers: [voucher()],
      treasury: new Map([[KAW.toLowerCase(), treasury("100000000", "250000")]]),
      // 2 units of account per token.
      rates: new Map([[KAW.toLowerCase(), 2_000_000n]]),
    });

    expect(holding).toMatchObject({
      tokenAddress: KAW.toLowerCase(),
      symbol: "KAW",
      balanceRaw: "100000000",
      liquidityRaw: "100000000",
      ratePpm: "2000000",
      feesRaw: "250000",
      uncatalogued: false,
    });
    // 100 tokens x 2 = 200 units of account, scaled to six decimals.
    expect(holding?.unitValueRaw).toBe("200000000");
    // 100 held against a cap of 200.
    expect(holding?.fillPercent).toBe(50);
  });

  it("prices an unread rate at parity rather than at nothing", () => {
    // The quoter itself reads an unset token as parity; a zero would claim the
    // pool values the voucher at nothing, which it never means.
    const [holding] = buildPoolHoldings({
      pool: pool(),
      vouchers: [voucher()],
      treasury: new Map([[KAW.toLowerCase(), treasury("100000000")]]),
    });

    expect(holding?.ratePpm).toBeNull();
    expect(holding?.unitValueRaw).toBe("100000000");
  });

  it("lists a token the catalog never projected, from the indexer alone", () => {
    // The pool registry is the authority on membership: a token seeded at
    // `initialize` is held and swappable while absent from the catalog.
    const holdings = buildPoolHoldings({
      pool: pool(),
      vouchers: [voucher()],
      treasury: new Map([[KAW.toLowerCase(), treasury("10000000")]]),
      indexedTokens: [accountToken()],
      rates: new Map([[KAW.toLowerCase(), PARITY]]),
    });

    expect(holdings).toHaveLength(2);
    const seeded = holdings.find((entry) => entry.tokenAddress === SAR.toLowerCase());
    expect(seeded).toMatchObject({
      symbol: "SAR",
      balanceRaw: "50000000",
      uncatalogued: true,
      // A limiter is configured but nothing records a cap for a token the
      // catalog does not carry.
      cap: { kind: "unrecorded" },
    });
  });

  it("prefers the chain balance over the indexer's for the same token", () => {
    const [holding] = buildPoolHoldings({
      pool: pool(),
      vouchers: [voucher()],
      treasury: new Map([[KAW.toLowerCase(), treasury("100000000")]]),
      indexedTokens: [accountToken({ tokenAddress: KAW, balance: "999000000" })],
    });

    expect(holding?.balanceRaw).toBe("100000000");
  });

  it("values available liquidity while keeping gross balance for the deposit cap", () => {
    const [holding] = buildPoolHoldings({
      pool: pool({ feesDecoupled: true }),
      vouchers: [voucher({ tokenLimit: "10000000" })],
      treasury: new Map([[KAW.toLowerCase(), treasury("7430000", "3930000", "3500000")]]),
      rates: new Map([[KAW.toLowerCase(), PARITY]]),
    });

    expect(holding).toMatchObject({
      balanceRaw: "7430000",
      liquidityRaw: "3500000",
      feesRaw: "3930000",
      unitValueRaw: "3500000",
      // The limiter checks the gross 7.43 balance, leaving 2.57 under a cap of 10.
      headroomRaw: "2570000",
      fillPercent: 74.3,
    });
  });

  it("falls back to the indexer's balance when the chain read did not cover the token", () => {
    const [holding] = buildPoolHoldings({
      pool: pool(),
      vouchers: [voucher()],
      treasury: new Map(),
      indexedTokens: [accountToken({ tokenAddress: KAW, balance: "70000000" })],
      rates: new Map([[KAW.toLowerCase(), PARITY]]),
    });

    expect(holding?.balanceRaw).toBe("70000000");
    // The indexer can recover the gross balance, but cannot know how much a
    // decoupled pool reserved. Unknown liquidity must not be shown as available.
    expect(holding?.liquidityRaw).toBeNull();
    expect(holding?.unitValueRaw).toBeNull();
    // Recomputed against the new balance, not left at the zero it was built with.
    expect(holding?.fillPercent).toBe(35);
  });

  it("separates the four deposit-cap outcomes", () => {
    const treasuryByToken = new Map([[KAW.toLowerCase(), treasury("0")]]);
    const capOf = (poolOverrides: Partial<UserPool>, voucherOverrides: Partial<PoolVoucher>) =>
      buildPoolHoldings({
        pool: pool(poolOverrides),
        vouchers: [voucher(voucherOverrides)],
        treasury: treasuryByToken,
      })[0];

    expect(capOf({}, {})?.cap).toEqual({ kind: "capped", raw: "200000000" });
    expect(capOf({}, { tokenLimit: "0" })?.cap).toEqual({ kind: "blocked" });
    expect(capOf({}, { tokenLimit: null })?.cap).toEqual({ kind: "unrecorded" });
    expect(capOf({ limiterAddress: null }, { tokenLimit: "0" })?.cap).toEqual({ kind: "uncapped" });
  });

  it("draws no bar where there is no cap to be full of", () => {
    const uncapped = buildPoolHoldings({
      pool: pool({ limiterAddress: null }),
      vouchers: [voucher()],
      treasury: new Map([[KAW.toLowerCase(), treasury("100000000")]]),
    })[0];
    expect(uncapped?.fillPercent).toBeNull();

    // A blocked voucher has no headroom whatever it currently holds.
    const blocked = buildPoolHoldings({
      pool: pool(),
      vouchers: [voucher({ tokenLimit: "0" })],
      treasury: new Map([[KAW.toLowerCase(), treasury("0")]]),
    })[0];
    expect(blocked?.fillPercent).toBe(100);
  });

  it("reports no value for a voucher whose decimals the catalog never recorded", () => {
    // Scaling is undefined without them, and an approximate holding is worse
    // than an absent one on a screen someone deposits against.
    const [holding] = buildPoolHoldings({
      pool: pool(),
      vouchers: [voucher({ decimals: null })],
      treasury: new Map([[KAW.toLowerCase(), treasury("100000000")]]),
    });

    expect(holding?.unitValueRaw).toBeNull();
  });

  it("declines to value a pool whose quoter exposes no readable rate", () => {
    // Only a RelativeQuoter answers `priceIndex`; on an oracle- or decimal-quoted
    // pool a reverted read normalizes to parity, so valuing it would state a
    // 1:1 rate nothing on chain supports. The holdings still list.
    const holdings = buildPoolHoldings({
      pool: pool({ quoterType: "oracle" }),
      vouchers: [voucher()],
      treasury: new Map([[KAW.toLowerCase(), treasury("100000000")]]),
      priced: false,
    });

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      balanceRaw: "100000000",
      unitValueRaw: null,
      // The deposit limit falls back to the voucher's own units for the same
      // reason: nothing prices it into the pool's unit of account.
      capUnitValueRaw: null,
      headroomUnitValueRaw: null,
    });
  });

  it("orders by what the pool holds, with the unpriceable rows last", () => {
    const holdings = buildPoolHoldings({
      pool: pool(),
      vouchers: [
        voucher({ id: "a", symbol: "AAA", tokenAddress: KAW }),
        voucher({ id: "b", symbol: "BBB", tokenAddress: SAR }),
        voucher({ id: "c", symbol: "CCC", tokenAddress: LIMITER, decimals: null }),
      ],
      treasury: new Map([
        [KAW.toLowerCase(), treasury("1000000")],
        [SAR.toLowerCase(), treasury("9000000")],
        [LIMITER.toLowerCase(), treasury("9999000000")],
      ]),
    });

    expect(holdings.map((entry) => entry.symbol)).toEqual(["BBB", "AAA", "CCC"]);
  });
});
