import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { describe, expect, it } from "vite-plus/test";

import {
  type PoolSwapTokenReads,
  buildPoolSwapTokens,
  defaultPoolSwapFrom,
  defaultPoolSwapTo,
  poolVouchersFromRegistry,
} from "./pool-swap-tokens";

const POOL = "0xdD97a5282D11e55d7271d466C80963d6793B276f" as const;
const LIMITER = "0x4d9000000000000000000000000000000000a1c7" as const;
const KAW = "0xAAA0000000000000000000000000000000000001" as const;
const SAR = "0xBbB0000000000000000000000000000000000002" as const;
const PLK = "0xCcC0000000000000000000000000000000000003" as const;

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

function reads(overrides: Partial<PoolSwapTokenReads> = {}): PoolSwapTokenReads {
  return {
    holderBalanceRaw: "0",
    poolBalanceRaw: "0",
    feesRaw: "0",
    limitRaw: null,
    ...overrides,
  };
}

describe("buildPoolSwapTokens", () => {
  it("orders what you hold ahead of what you don't, largest holding first", () => {
    const tokens = buildPoolSwapTokens({
      pool: pool({ limiterAddress: null }),
      vouchers: [
        voucher({ id: "v1", tokenAddress: KAW, symbol: "KAW" }),
        voucher({ id: "v2", tokenAddress: SAR, symbol: "SAR" }),
        voucher({ id: "v3", tokenAddress: PLK, symbol: "PLK" }),
      ],
      reads: new Map([
        [KAW.toLowerCase(), reads({ holderBalanceRaw: "5000000" })],
        [SAR.toLowerCase(), reads({ holderBalanceRaw: "90000000" })],
      ]),
    });

    expect(tokens.map((token) => token.token.symbol)).toEqual(["SAR", "KAW", "PLK"]);
    expect(tokens.map((token) => token.held)).toEqual([true, true, false]);
  });

  it("lists a voucher you hold none of rather than hiding it", () => {
    const tokens = buildPoolSwapTokens({
      pool: pool({ limiterAddress: null }),
      vouchers: [voucher()],
      reads: new Map([[KAW.toLowerCase(), reads()]]),
    });

    // A holder who came here knowing this pool takes their voucher has to see it
    // listed; dropping it reads as the pool no longer accepting it.
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.canSwapIn).toBe(false);
  });

  it("refuses the input side once the pool is full of the voucher", () => {
    const [full, roomy] = buildPoolSwapTokens({
      pool: pool(),
      vouchers: [
        voucher({ id: "v1", tokenAddress: KAW, symbol: "KAW" }),
        voucher({ id: "v2", tokenAddress: SAR, symbol: "SAR" }),
      ],
      reads: new Map([
        [
          KAW.toLowerCase(),
          reads({ holderBalanceRaw: "9000000", poolBalanceRaw: "80000000", limitRaw: "80000000" }),
        ],
        [
          SAR.toLowerCase(),
          reads({ holderBalanceRaw: "8000000", poolBalanceRaw: "10000000", limitRaw: "80000000" }),
        ],
      ]),
    });

    expect(full?.depositHeadroomRaw).toBe("0");
    expect(full?.canSwapIn).toBe(false);
    expect(roomy?.depositHeadroomRaw).toBe("70000000");
    expect(roomy?.canSwapIn).toBe(true);
  });

  it("does not refuse the input side on a cap nobody recorded", () => {
    // `unrecorded` is an unknown ceiling, not a closed one. Blocking on a number
    // nothing supplied would refuse a swap the contract would have taken.
    const [token] = buildPoolSwapTokens({
      pool: pool(),
      vouchers: [voucher({ tokenLimit: null })],
      reads: new Map([[KAW.toLowerCase(), reads({ holderBalanceRaw: "9000000" })]]),
    });

    expect(token?.cap.kind).toBe("unrecorded");
    expect(token?.depositHeadroomRaw).toBeNull();
    expect(token?.canSwapIn).toBe(true);
  });

  it("prefers the chain's cap over the catalog's, and falls back when the read failed", () => {
    const [fromChain, fromCatalog] = buildPoolSwapTokens({
      pool: pool(),
      vouchers: [
        voucher({ id: "v1", tokenAddress: KAW, symbol: "KAW", tokenLimit: "200000000" }),
        voucher({ id: "v2", tokenAddress: SAR, symbol: "SAR", tokenLimit: "200000000" }),
      ],
      reads: new Map([
        [
          KAW.toLowerCase(),
          reads({ holderBalanceRaw: "9000000", poolBalanceRaw: "0", limitRaw: "50000000" }),
        ],
        [SAR.toLowerCase(), reads({ holderBalanceRaw: "8000000", poolBalanceRaw: "0" })],
      ]),
    });

    expect(fromChain?.depositHeadroomRaw).toBe("50000000");
    expect(fromCatalog?.depositHeadroomRaw).toBe("200000000");
  });

  it("reserves accrued fees from liquidity only where the pool decouples them", () => {
    const decoupled = buildPoolSwapTokens({
      pool: pool({ feesDecoupled: true }),
      vouchers: [voucher()],
      reads: new Map([
        [KAW.toLowerCase(), reads({ poolBalanceRaw: "10000000", feesRaw: "4000000" })],
      ]),
    });
    const coupled = buildPoolSwapTokens({
      pool: pool({ feesDecoupled: false }),
      vouchers: [voucher()],
      reads: new Map([
        [KAW.toLowerCase(), reads({ poolBalanceRaw: "10000000", feesRaw: "4000000" })],
      ]),
    });

    expect(decoupled[0]?.liquidityRaw).toBe("6000000");
    expect(coupled[0]?.liquidityRaw).toBe("10000000");
  });

  it("refuses the output side when the pool has nothing left to pay out", () => {
    const [token] = buildPoolSwapTokens({
      pool: pool({ feesDecoupled: true }),
      vouchers: [voucher()],
      reads: new Map([
        [KAW.toLowerCase(), reads({ poolBalanceRaw: "4000000", feesRaw: "4000000" })],
      ]),
    });

    expect(token?.liquidityRaw).toBe("0");
    expect(token?.canSwapOut).toBe(false);
  });

  it("refuses both sides of a voucher the catalog never sized", () => {
    // Without decimals nothing can parse an input or format a quote, so the row
    // states its own unusability rather than guessing at eighteen.
    const [token] = buildPoolSwapTokens({
      pool: pool({ limiterAddress: null }),
      vouchers: [voucher({ decimals: null })],
      reads: new Map([
        [KAW.toLowerCase(), reads({ holderBalanceRaw: "9000000", poolBalanceRaw: "9000000" })],
      ]),
    });

    expect(token?.decimals).toBeNull();
    expect(token?.canSwapIn).toBe(false);
    expect(token?.canSwapOut).toBe(false);
  });

  it("lists every voucher unheld while the chain reads are still in flight", () => {
    const tokens = buildPoolSwapTokens({
      pool: pool({ limiterAddress: null }),
      vouchers: [
        voucher({ id: "v1", tokenAddress: KAW }),
        voucher({ id: "v2", tokenAddress: SAR }),
      ],
    });

    expect(tokens.every((token) => !token.held && !token.canSwapIn)).toBe(true);
  });
});

describe("defaultPoolSwapFrom", () => {
  it("takes the largest holding the pool will actually accept", () => {
    const tokens = buildPoolSwapTokens({
      pool: pool(),
      vouchers: [
        voucher({ id: "v1", tokenAddress: KAW, symbol: "KAW" }),
        voucher({ id: "v2", tokenAddress: SAR, symbol: "SAR" }),
      ],
      reads: new Map([
        // The bigger balance, but the pool is full of it.
        [
          KAW.toLowerCase(),
          reads({ holderBalanceRaw: "90000000", poolBalanceRaw: "80000000", limitRaw: "80000000" }),
        ],
        [
          SAR.toLowerCase(),
          reads({ holderBalanceRaw: "8000000", poolBalanceRaw: "0", limitRaw: "80000000" }),
        ],
      ]),
    });

    expect(defaultPoolSwapFrom(tokens)?.token.symbol).toBe("SAR");
  });

  it("has no answer when nothing held is swappable", () => {
    const tokens = buildPoolSwapTokens({
      pool: pool({ limiterAddress: null }),
      vouchers: [voucher()],
      reads: new Map([[KAW.toLowerCase(), reads()]]),
    });

    expect(defaultPoolSwapFrom(tokens)).toBeUndefined();
  });
});

describe("defaultPoolSwapTo", () => {
  const vouchers = [
    voucher({ id: "v1", tokenAddress: KAW, symbol: "KAW" }),
    voucher({ id: "v2", tokenAddress: SAR, symbol: "SAR" }),
    voucher({ id: "v3", tokenAddress: PLK, symbol: "PLK" }),
  ];
  const liquidity = new Map([
    [KAW.toLowerCase(), reads({ poolBalanceRaw: "10000000" })],
    [SAR.toLowerCase(), reads({ poolBalanceRaw: "90000000" })],
    [PLK.toLowerCase(), reads({ poolBalanceRaw: "20000000" })],
  ]);

  it("prefers the voucher the pool is denominated in", () => {
    const basePool = pool({ limiterAddress: null, defaultVoucherId: "v3" });
    const tokens = buildPoolSwapTokens({ pool: basePool, vouchers, reads: liquidity });

    expect(defaultPoolSwapTo(tokens, basePool, vouchers)?.token.symbol).toBe("PLK");
  });

  it("falls back to whatever the pool holds most of, excluding the input side", () => {
    const basePool = pool({ limiterAddress: null });
    const tokens = buildPoolSwapTokens({ pool: basePool, vouchers, reads: liquidity });

    expect(defaultPoolSwapTo(tokens, basePool, vouchers)?.token.symbol).toBe("SAR");
    expect(defaultPoolSwapTo(tokens, basePool, vouchers, SAR.toLowerCase())?.token.symbol).toBe(
      "PLK",
    );
  });

  it("skips the default voucher when the pool cannot pay it out", () => {
    const basePool = pool({ limiterAddress: null, defaultVoucherId: "v1" });
    const tokens = buildPoolSwapTokens({
      pool: basePool,
      vouchers,
      reads: new Map([...liquidity, [KAW.toLowerCase(), reads({ poolBalanceRaw: "0" })]]),
    });

    expect(defaultPoolSwapTo(tokens, basePool, vouchers)?.token.symbol).toBe("SAR");
  });
});

describe("poolVouchersFromRegistry", () => {
  it("returns the catalog untouched for a pool with no registry", () => {
    const catalog = [voucher({ tokenAddress: KAW })];

    expect(poolVouchersFromRegistry({ catalog, registry: null })).toBe(catalog);
  });

  it("lists a registry member the catalog never projected", () => {
    // The seeded default voucher: on chain from `initialize`, absent from the
    // catalog's pool voucher list.
    const merged = poolVouchersFromRegistry({
      catalog: [voucher({ id: "v1", tokenAddress: KAW, symbol: "KAW" })],
      registry: [KAW, PLK],
      metadata: new Map([[PLK.toLowerCase(), { symbol: "PLK", name: "Plank", decimals: 18 }]]),
    });

    expect(merged.map((entry) => entry.symbol)).toEqual(["KAW", "PLK"]);
    expect(merged[1]).toMatchObject({
      tokenAddress: PLK,
      name: "Plank",
      decimals: 18,
      isAllowed: true,
      tokenLimit: null,
    });
  });

  it("keeps the catalog's richer record where both sources know a token", () => {
    const catalogEntry = voucher({ id: "v1", tokenAddress: KAW, iconUrl: "https://x/kaw.png" });

    const merged = poolVouchersFromRegistry({
      catalog: [catalogEntry],
      registry: [KAW.toLowerCase()],
      metadata: new Map([[KAW.toLowerCase(), { symbol: "ZZZ", name: "Other", decimals: 2 }]]),
    });

    expect(merged).toEqual([catalogEntry]);
  });

  it("drops a catalog voucher the registry does not admit", () => {
    // `SwapPool` runs `have(token)` on both legs, so offering it would only
    // produce a signature that reverts `UnauthorizedToken`.
    const merged = poolVouchersFromRegistry({
      catalog: [voucher({ tokenAddress: KAW }), voucher({ id: "v2", tokenAddress: SAR })],
      registry: [SAR],
    });

    expect(merged.map((entry) => entry.tokenAddress)).toEqual([SAR]);
  });

  it("lists a member with unreadable metadata as unsizable rather than omitting it", () => {
    const [entry] = poolVouchersFromRegistry({ catalog: [], registry: [PLK] });

    expect(entry).toMatchObject({ tokenAddress: PLK, decimals: null });
    expect(entry?.symbol).toBe("0xCcC000…000003");
    expect(entry?.name).toBe("0xCcC000…000003");
  });

  it("lists a duplicated registry entry once", () => {
    const merged = poolVouchersFromRegistry({
      catalog: [],
      registry: [PLK, PLK.toLowerCase()],
    });

    expect(merged).toHaveLength(1);
  });

  it("returns nothing for a registry that admits nothing", () => {
    expect(
      poolVouchersFromRegistry({ catalog: [voucher({ tokenAddress: KAW })], registry: [] }),
    ).toEqual([]);
  });

  it("builds swap tokens whose unsized rows are listed but not selectable", () => {
    const merged = poolVouchersFromRegistry({ catalog: [], registry: [PLK] });
    const [token] = buildPoolSwapTokens({
      pool: pool({ limiterAddress: null }),
      vouchers: merged,
      reads: new Map([[PLK.toLowerCase(), reads({ holderBalanceRaw: "5", poolBalanceRaw: "9" })]]),
    });

    expect(token).toMatchObject({ decimals: null, canSwapIn: false, canSwapOut: false });
  });
});
