import { describe, expect, it } from "vite-plus/test";
import { CELO_MAINNET_CHAIN_ID } from "../../lib/constants/celo";
import {
  getPoolDeploymentStages,
  type PoolCreateInput,
  poolCreateSchema,
  poolDeploymentContractCount,
  PoolOracleUnavailableError,
  poolUnitSchemaForPricing,
  toPoolDeployPayload,
} from "./logic";

const validPool: PoolCreateInput = {
  name: "Kilifi Growers",
  symbol: "KGP1",
  unit: "KES",
  description: "A pool for growers in Kilifi.",
  pricing: "oracle",
  feePolicyDefault: "1",
  feesDecoupled: false,
  location: {
    locationName: "Kilifi, Kenya",
    country: "KE",
    lat: -3.5107,
    lng: 39.9093,
  },
  tags: ["Agriculture"],
  email: "steward@example.org",
  website: "https://kilifi.example",
  phone: "+254712345678",
  terms: "https://kilifi.example/terms",
  acceptedTerms: true,
  acceptedSproutLicense: true,
};

const OWNER = "0x1a3E18f7329bb8b533E5Be0D8B176eE1ed73563d";

describe("poolCreateSchema", () => {
  it("accepts the price-feed defaults", () => {
    expect(poolCreateSchema.safeParse(validPool).success).toBe(true);
  });

  it("requires a configured base currency for price-feed pools", () => {
    const result = poolCreateSchema.safeParse({ ...validPool, unit: "HOUR" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["unit"],
          message: "Choose rates you set or equal value when the unit has no price feed",
        }),
      );
    }
  });

  it("uses the same oracle eligibility rule for the live unit field", () => {
    const schema = poolUnitSchemaForPricing("oracle", CELO_MAINNET_CHAIN_ID);

    expect(schema.safeParse("KES").success).toBe(true);
    expect(schema.safeParse("HOUR").error?.issues[0]?.message).toBe(
      "Choose rates you set or equal value when the unit has no price feed",
    );
  });

  it("allows HOUR for pool pricing that does not need a base currency", () => {
    expect(
      poolCreateSchema.safeParse({ ...validPool, unit: "HOUR", pricing: "decimal" }).success,
    ).toBe(true);
  });

  it("requires at least three characters for the pool identity fields", () => {
    for (const field of ["name", "symbol", "description"] as const) {
      const result = poolCreateSchema.safeParse({ ...validPool, [field]: "ab" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: [field],
            message: expect.stringContaining("at least 3"),
          }),
        );
      }
    }
  });

  it("accepts only blank or valid HTTP website URLs", () => {
    expect(poolCreateSchema.safeParse({ ...validPool, website: "" }).success).toBe(true);
    expect(
      poolCreateSchema.safeParse({ ...validPool, website: "https://kilifi.example" }).success,
    ).toBe(true);
    expect(poolCreateSchema.safeParse({ ...validPool, website: "kilifi.example" }).success).toBe(
      false,
    );
  });

  it("accepts only blank or valid HTTP terms URLs", () => {
    expect(poolCreateSchema.safeParse({ ...validPool, terms: "" }).success).toBe(true);
    expect(
      poolCreateSchema.safeParse({ ...validPool, terms: "https://kilifi.example/terms" }).success,
    ).toBe(true);
    expect(
      poolCreateSchema.safeParse({ ...validPool, terms: "kilifi.example/terms" }).success,
    ).toBe(false);
  });
});

describe("toPoolDeployPayload", () => {
  it("always deploys pools with six decimals", () => {
    expect(toPoolDeployPayload(validPool, OWNER, CELO_MAINNET_CHAIN_ID).decimals).toBe("6");
  });

  it("only decouples fees when the configured fee is above zero", () => {
    expect(
      toPoolDeployPayload(
        { ...validPool, feePolicyDefault: "0", feesDecoupled: true },
        OWNER,
        CELO_MAINNET_CHAIN_ID,
      ).feesDecoupled,
    ).toBe(false);
    expect(
      toPoolDeployPayload(
        { ...validPool, feePolicyDefault: "0.5", feesDecoupled: true },
        OWNER,
        CELO_MAINNET_CHAIN_ID,
      ).feesDecoupled,
    ).toBe(true);
  });

  it("maps the complete live pool request and omits blank optional fields", () => {
    expect(toPoolDeployPayload({ ...validPool, phone: "" }, OWNER, CELO_MAINNET_CHAIN_ID)).toEqual({
      name: "Kilifi Growers",
      symbol: "KGP1",
      decimals: "6",
      owner: OWNER,
      quoterType: "oracle",
      feesDecoupled: false,
      feePolicyDefault: "1",
      baseCurrency: "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0",
      description: "A pool for growers in Kilifi.",
      email: "steward@example.org",
      website: "https://kilifi.example",
      terms: "https://kilifi.example/terms",
      locationName: "Kilifi, Kenya",
      geoLat: -3.5107,
      geoLng: 39.9093,
      tags: ["Agriculture"],
    });
  });

  it("omits blank optional contact fields", () => {
    const payload = toPoolDeployPayload(
      { ...validPool, email: "", website: "", phone: "", terms: "" },
      OWNER,
      CELO_MAINNET_CHAIN_ID,
    );

    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("website");
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("terms");
  });

  it("does not send baseCurrency when the pricing strategy does not use it", () => {
    expect(
      toPoolDeployPayload({ ...validPool, pricing: "relative" }, OWNER, CELO_MAINNET_CHAIN_ID),
    ).not.toHaveProperty("baseCurrency");
  });

  it("guards the payload against an oracle unit without a feed", () => {
    expect(() =>
      toPoolDeployPayload({ ...validPool, unit: "HOUR" }, OWNER, CELO_MAINNET_CHAIN_ID),
    ).toThrow(PoolOracleUnavailableError);
  });

  it("does not use Celo mainnet oracle addresses on another chain", () => {
    expect(() => toPoolDeployPayload(validPool, OWNER, 1)).toThrow(PoolOracleUnavailableError);
  });
});

const stageLabels = {
  registry: "Voucher registry",
  limits: "Limits",
  feePolicy: "Fee policy",
  pricing: "Pricing",
  pool: "The pool",
};

const statusLabels = {
  confirmed: "Confirmed",
  inNetwork: "In network",
  failed: "Failed",
  reverted: "Reverted",
  queued: "Queued",
  notSent: "Not sent",
};

describe("getPoolDeploymentStages", () => {
  it("starts the first stage and leaves later stages idle before records arrive", () => {
    expect(
      getPoolDeploymentStages([], stageLabels, statusLabels).map((stage) => stage.state),
    ).toEqual(["active", "idle", "idle", "idle", "idle"]);
  });

  it("marks a terminal stage failure and does not activate later stages", () => {
    const stages = getPoolDeploymentStages(
      [
        { otxType: "POOL_TOKEN_INDEX_DEPLOY", status: "SUCCESS" },
        { otxType: "POOL_LIMITER_DEPLOY", status: "REVERTED" },
        { otxType: "POOL_FEE_POLICY_DEPLOY", status: "PENDING" },
      ],
      stageLabels,
      statusLabels,
    );

    expect(stages.map(({ state, status }) => ({ state, status }))).toEqual([
      { state: "done", status: "Confirmed" },
      { state: "failed", status: "Reverted" },
      { state: "idle", status: "Queued" },
      { state: "idle", status: "Queued" },
    ]);
  });

  it("derives the decimal deployment count and omits its pricing stage", () => {
    expect(poolDeploymentContractCount("decimal")).toBe(4);
    expect(poolDeploymentContractCount("oracle")).toBe(5);
    expect(getPoolDeploymentStages([], stageLabels, statusLabels, "decimal")).toHaveLength(4);
  });
});
