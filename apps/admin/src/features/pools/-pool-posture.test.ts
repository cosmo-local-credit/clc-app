import type { AdminPoolTransaction } from "@clc/api/features/admin/client";
import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";
import { describe, expect, it } from "vite-plus/test";

import {
  depositCap,
  groupPoolFeeds,
  poolActivitySeries,
  poolAdvisories,
  poolComposition,
  poolDependencies,
} from "./pool-posture";

const POOL_ADDRESS = "0xdD97a5282D11e55d7271d466C80963d6793B276f" as const;
const LIMITER = "0x4d9000000000000000000000000000000000a1c7" as const;
const AGGREGATOR = "0x0826000000000000000000000000000000005e9D" as const;

function pool(overrides: Partial<UserPool> = {}): UserPool {
  return {
    id: "12",
    chainId: 42220,
    address: POOL_ADDRESS,
    name: "Kawangware",
    symbol: "KAW",
    ownerAddress: null,
    feePpm: 10_000,
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
    unitOfAccount: "KES",
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
    voucherCount: 2,
    tags: [],
    ...overrides,
  };
}

function voucher(overrides: Partial<PoolVoucher> = {}): PoolVoucher {
  return {
    id: "1",
    chainId: 42220,
    name: "Kiriba",
    description: "Kiriba",
    symbol: "RIBA",
    tokenAddress: "0x3aa7000000000000000000000000000000000102" as PoolVoucher["tokenAddress"],
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
    tokenLimit: "300000000",
    oracleFeedId: "7",
    oracleName: "KES / USD",
    oracleAddress: AGGREGATOR,
    offerCount: 12,
    availableOfferCount: 3,
    tags: [],
    ...overrides,
  };
}

describe("depositCap", () => {
  it("reads a recorded cap as an amount", () => {
    expect(depositCap(pool(), voucher())).toEqual({ kind: "capped", raw: "300000000" });
  });

  it("separates a zero cap from a missing one", () => {
    // Both render as no headroom, but only the first is a decision someone made.
    expect(depositCap(pool(), voucher({ tokenLimit: "0" }))).toEqual({ kind: "blocked" });
    expect(depositCap(pool(), voucher({ tokenLimit: null }))).toEqual({ kind: "unrecorded" });
  });

  it("caps nothing when the pool has no limiter", () => {
    // SwapPool.mustWithinLimit returns early, so even a zero row is uncapped.
    const noLimiter = pool({ limiterAddress: null });
    expect(depositCap(noLimiter, voucher({ tokenLimit: "0" }))).toEqual({ kind: "uncapped" });
  });
});

describe("groupPoolFeeds", () => {
  it("groups by aggregator, largest first, with the unpriced row last", () => {
    const groups = groupPoolFeeds([
      voucher({ id: "1" }),
      voucher({ id: "2", symbol: "MUMO" }),
      voucher({ id: "3", symbol: "USDm", oracleFeedId: "9", oracleName: "USDT / USD" }),
      voucher({
        id: "4",
        symbol: "GRTV",
        oracleFeedId: null,
        oracleName: null,
        oracleAddress: null,
      }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["7", "9", "unpriced"]);
    expect(groups[0]?.vouchers).toHaveLength(2);
    expect(groups[2]?.vouchers.map((entry) => entry.symbol)).toEqual(["GRTV"]);
  });

  it("omits the unpriced row when every voucher is mapped", () => {
    expect(groupPoolFeeds([voucher()]).map((group) => group.key)).toEqual(["7"]);
  });
});

describe("poolComposition", () => {
  it("counts pricing, caps and offers over the fetched page", () => {
    const composition = poolComposition(pool({ voucherCount: 3 }), [
      voucher({ id: "1" }),
      voucher({ id: "2", tokenLimit: "0" }),
      voucher({ id: "3", oracleFeedId: null, offerCount: 1, availableOfferCount: 0 }),
    ]);

    expect(composition).toEqual({
      loaded: 3,
      total: 3,
      priced: 2,
      unpriced: 1,
      blocked: 1,
      feeds: 1,
      offers: 25,
      liveOffers: 6,
    });
  });
});

describe("poolAdvisories", () => {
  it("is empty for a fully recorded, priced and capped pool", () => {
    const complete = pool({
      tokenRegistryAddress: LIMITER,
      quoterAddress: LIMITER,
      feePolicyAddress: LIMITER,
      feeAddress: LIMITER,
      protocolFeeControllerAddress: LIMITER,
    });
    const composition = poolComposition(complete, [voucher()]);

    expect(poolAdvisories(complete, composition, { vouchersAvailable: true })).toEqual([]);
  });

  it("names the unrecorded pointers rather than counting them alone", () => {
    const composition = poolComposition(pool(), [voucher()]);
    const [advisory] = poolAdvisories(pool(), composition, { vouchersAvailable: true });

    expect(advisory?.title).toBe("4 of 5 contract pointers unrecorded");
    expect(advisory?.detail).toContain("quoter");
  });

  it("says nothing about a fee recipient the deploy path never records", () => {
    // upsert-pool-from-deploy leaves fee_address to the importer while the deploy
    // initializes SwapPool with the owner, so a null here is the normal case.
    const recorded = pool({
      tokenRegistryAddress: LIMITER,
      quoterAddress: LIMITER,
      feePolicyAddress: LIMITER,
      protocolFeeControllerAddress: LIMITER,
      feeAddress: null,
    });
    const composition = poolComposition(recorded, [voucher()]);

    expect(poolAdvisories(recorded, composition, { vouchersAvailable: true })).toEqual([]);
  });

  it("reports unpriced vouchers and zero caps, worst first", () => {
    const composition = poolComposition(pool(), [
      voucher({ id: "1", oracleFeedId: null }),
      voucher({ id: "2", tokenLimit: "0" }),
    ]);
    const ids = poolAdvisories(pool(), composition, { vouchersAvailable: true }).map(
      (advisory) => advisory.id,
    );

    expect(ids).toEqual(["unpriced", "blocked", "dependencies"]);
  });

  it("draws no conclusion from a voucher page that never arrived", () => {
    // Zero rows would otherwise read as a pool with nothing wrong in it.
    const composition = poolComposition(pool(), []);
    const ids = poolAdvisories(pool(), composition, { vouchersAvailable: false }).map(
      (advisory) => advisory.id,
    );

    expect(ids).toEqual(["dependencies"]);
  });
});

describe("poolDependencies", () => {
  it("lists SwapPool's six pointers in the order the panel shows them", () => {
    expect(poolDependencies(pool()).map((entry) => entry.key)).toEqual([
      "registry",
      "limiter",
      "quoter",
      "feePolicy",
      "feeRecipient",
      "protocolController",
    ]);
  });
});

describe("poolActivitySeries", () => {
  const NOW = new Date("2026-08-19T14:00:00");

  function tx(daysAgo: number, type: "swap" | "deposit"): AdminPoolTransaction {
    const at = new Date(NOW.getTime() - daysAgo * 86_400_000);
    return { t: at.toISOString(), type } as AdminPoolTransaction;
  }

  it("gives every day in the window a point, including the quiet ones", () => {
    // A line drawn only through days that had activity implies a slope across
    // the gap, which is the opposite of what an empty day means.
    const activity = poolActivitySeries([tx(0, "swap")], { receivedCount: 1, perPage: 100 }, NOW);

    expect(activity.points).toHaveLength(7);
    expect(activity.points.filter((point) => point.swaps === 0)).toHaveLength(6);
  });

  it("counts swaps and deposits into separate series", () => {
    const activity = poolActivitySeries(
      [tx(1, "swap"), tx(1, "swap"), tx(1, "deposit"), tx(3, "deposit")],
      { receivedCount: 4, perPage: 100 },
      NOW,
    );

    const yesterday = activity.points.at(-2);
    expect(yesterday).toMatchObject({ swaps: 2, deposits: 1 });
    expect(activity.points.at(-4)).toMatchObject({ swaps: 0, deposits: 1 });
  });

  it("drops activity older than the window rather than folding it into day one", () => {
    const activity = poolActivitySeries(
      [tx(30, "swap"), tx(0, "swap")],
      { receivedCount: 2, perPage: 100 },
      NOW,
    );

    expect(activity.points.reduce((total, point) => total + point.swaps, 0)).toBe(1);
  });

  it("treats a short page as the whole record however old it is", () => {
    const activity = poolActivitySeries([tx(0, "swap")], { receivedCount: 1, perPage: 100 }, NOW);
    expect(activity.complete).toBe(true);
  });

  it("reports a full page that never reached the window start as incomplete", () => {
    // Every row is from today, so the page ran out before the week did and the
    // earlier days are undercounted. The chart has to say so.
    const today = Array.from({ length: 100 }, () => tx(0, "swap"));
    const activity = poolActivitySeries(today, { receivedCount: 100, perPage: 100 }, NOW);

    expect(activity.complete).toBe(false);
  });

  it("is complete when a full page reaches past the window start", () => {
    const activity = poolActivitySeries(
      [...Array.from({ length: 99 }, () => tx(0, "swap")), tx(9, "swap")],
      { receivedCount: 100, perPage: 100 },
      NOW,
    );

    expect(activity.complete).toBe(true);
  });

  it("ignores a transaction with an unparseable timestamp", () => {
    const activity = poolActivitySeries(
      [{ t: "not a date", type: "swap" } as AdminPoolTransaction],
      { receivedCount: 1, perPage: 100 },
      NOW,
    );

    expect(activity.points.every((point) => point.swaps === 0)).toBe(true);
  });
});
