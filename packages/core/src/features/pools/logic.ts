import { getAddress, isAddress, zeroAddress } from "viem";
import { z } from "zod";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsSchema,
  optionalWebsiteSchema,
} from "../../lib/contact";
import { isUnitOfAccount, type UnitOfAccount } from "../../lib/currencies";
import {
  CELO_MAINNET_CHAIN_ID,
  CELO_MAINNET_CKES_ADDRESS,
  CELO_MAINNET_CUSD_ADDRESS,
} from "../../lib/constants/celo";
import { optionalStoredImageUrlSchema } from "../../lib/image-url";
import { isTerminalOtxFailure } from "../../lib/otx";
import { locationSchema } from "../location/logic";

export const poolNameSchema = z
  .string()
  .trim()
  .min(3, { message: "Pool name must be at least 3 characters" })
  .max(80, { message: "Pool name must be 80 characters or fewer" });

export const poolSymbolSchema = z
  .string()
  .trim()
  .min(3, { message: "Pool shortcode must be at least 3 characters" })
  .max(6, { message: "Pool shortcode must be 6 characters or fewer" })
  .regex(/^[A-Z0-9]+$/, { message: "Use only letters and numbers for the pool shortcode" });

export const poolDescriptionSchema = z
  .string()
  .trim()
  .min(3, { message: "Pool description must be at least 3 characters" })
  .max(500, { message: "Pool description must be 500 characters or fewer" });

/**
 * The text of a deployed pool's catalog record, as its owner or a steward may
 * correct it after the fact. The display name reuses the publish rule for a
 * pool name and the description reuses its publish rule too, so a pool cannot
 * be edited into a state its create form would have rejected; the description
 * also accepts "" because clearing a field is a legitimate correction and
 * imported rows may never have had one. Terms is validated by length only; a
 * form with a link/text switch applies the narrower schema per mode.
 */
export const poolProfileTextSchema = z.object({
  displayName: poolNameSchema,
  description: poolDescriptionSchema.or(z.literal("")),
  unitOfAccount: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || /^[A-Z0-9]{2,16}$/.test(value), {
      message: "Use letters and numbers, for example KES",
    }),
  email: optionalEmailSchema,
  website: optionalWebsiteSchema,
  phone: optionalPhoneSchema,
  terms: optionalTermsSchema,
});

export const poolSwapFeeSchema = z
  .string()
  .trim()
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100, {
    message: "Swap fee must be a number from 0 to 100",
  });

/**
 * Where decoupled swap fees are paid. Blank means the pool owner, which is what
 * the deploy defaults to; anything else has to be a real account.
 */
export const poolFeeAddressSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || (isAddress(value) && value.toLowerCase() !== zeroAddress), {
    message: "Enter a valid wallet address",
  });

export const poolTermsSchema = z.literal(true, {
  error: "Accept the terms to publish your pool",
});

export const poolSproutLicenseSchema = z.literal(true, {
  error: "Accept the SPROUT License to publish your pool",
});

const poolUnitSchema = z.custom<UnitOfAccount>(isUnitOfAccount, {
  message: "Choose a currency",
});

/**
 * The pricing models a new pool may be published with.
 *
 * Relative pricing is the product default. Its per-token rates can be managed
 * as vouchers join the pool, while unset rates start at parity. DecimalQuoter
 * remains the stateless equal-value option and OracleQuoter uses live feeds.
 */
const poolPricingSchema = z.enum(["relative", "oracle", "decimal"]);

/**
 * The pricing models a pool may *be*, which is the wider set.
 *
 * A pool published before RelativeQuoter was retired still runs one, and the
 * console has to be able to say so rather than mistake it for a model whose
 * setters it would then sign against the wrong contract.
 */
const poolQuoterTypeSchema = z.enum(["oracle", "relative", "decimal"]);

export type PoolUnit = z.infer<typeof poolUnitSchema>;
export type PoolPricing = z.infer<typeof poolPricingSchema>;
export type PoolQuoterType = z.infer<typeof poolQuoterTypeSchema>;

export const POOL_QUOTER_TYPES = poolQuoterTypeSchema.options;

/**
 * The token an OracleQuoter prices a pool's unit against, per chain.
 *
 * A unit is offered for oracle pricing only where the chain has a stable whose
 * feed the quoter can read. Celo has Mento's; a chain absent from this table
 * has none, so oracle pricing is refused there rather than deploying a quoter
 * with a base currency that does not exist.
 */
const POOL_ORACLE_BASE_CURRENCY: Record<number, Partial<Record<PoolUnit, string>>> = {
  [CELO_MAINNET_CHAIN_ID]: {
    KES: CELO_MAINNET_CKES_ADDRESS,
    USD: CELO_MAINNET_CUSD_ADDRESS,
  },
};

function getPoolOracleBaseCurrency(unit: PoolUnit, chainId: number): string | undefined {
  return POOL_ORACLE_BASE_CURRENCY[chainId]?.[unit];
}

/** Whether any unit at all can be oracle-priced on this chain. */
export function chainHasPoolOracle(chainId: number): boolean {
  return Object.keys(POOL_ORACLE_BASE_CURRENCY[chainId] ?? {}).length > 0;
}

function hasPoolOracleBaseCurrency(unit: PoolUnit, chainId: number): boolean {
  return getPoolOracleBaseCurrency(unit, chainId) !== undefined;
}

export function poolUnitSchemaForPricing(pricing: PoolPricing, chainId: number) {
  return poolUnitSchema.refine(
    (unit) => pricing !== "oracle" || hasPoolOracleBaseCurrency(unit, chainId),
    "Choose rates you set or equal value when the unit has no price feed",
  );
}

/**
 * Takes the chain because the unit check depends on it: which units can be
 * oracle-priced is a property of what is deployed on the chain being published
 * to. It used to be fixed at Celo mainnet here while `poolUnitSchemaForPricing`
 * and `toPoolDeployPayload` were both given the connected chain, so on any other
 * chain the form accepted a unit that the payload builder then threw on.
 */
export function poolCreateSchemaForChain(chainId: number) {
  return z
    .object({
      name: poolNameSchema,
      symbol: poolSymbolSchema,
      unitOfAccount: poolUnitSchema,
      description: poolDescriptionSchema,
      pricing: poolPricingSchema,
      feePolicyDefault: poolSwapFeeSchema,
      feesDecoupled: z.boolean(),
      feeAddress: poolFeeAddressSchema,
      location: locationSchema,
      tags: z.array(z.string()),
      email: optionalEmailSchema,
      website: optionalWebsiteSchema,
      phone: optionalPhoneSchema,
      terms: optionalTermsSchema,
      // Already uploaded by the time they reach the form: the picker uploads on
      // selection, so these hold a stored URL or nothing.
      imageUrl: optionalStoredImageUrlSchema,
      acceptedTerms: poolTermsSchema,
      acceptedSproutLicense: poolSproutLicenseSchema,
    })
    .superRefine((value, ctx) => {
      if (value.pricing !== "oracle" || hasPoolOracleBaseCurrency(value.unitOfAccount, chainId)) {
        return;
      }
      ctx.addIssue({
        code: "custom",
        path: ["unitOfAccount"],
        message: "Choose rates you set or equal value when the unit has no price feed",
      });
    });
}

export type PoolCreateInput = z.infer<ReturnType<typeof poolCreateSchemaForChain>>;

export type PoolDeployPayload = {
  name: string;
  symbol: string;
  decimals: string;
  owner: string;
  quoterType: PoolPricing;
  feesDecoupled: boolean;
  feePolicyDefault: string;
  /** Present only when fees are decoupled: the account they are paid to. */
  feeAddress?: string;
  baseCurrency?: string;
  unitOfAccount: string;
  description: string;
  email?: string;
  website?: string;
  phone?: string;
  terms?: string;
  locationName?: string;
  geoLat?: number;
  geoLng?: number;
  /**
   * Off-chain catalog images, carried through the deploy so a pool published with
   * a logo still has one once its address exists. clc-core validates them as
   * http(s) before queueing, because the catalog column that finally receives
   * them refuses anything else — and by then the transaction is signed.
   */
  imageUrl?: string;
  bannerUrl?: string;
  tags: string[];
};

export class PoolOracleUnavailableError extends Error {
  constructor() {
    super("The selected unit does not have a configured price feed.");
    this.name = "PoolOracleUnavailableError";
  }
}

export function toPoolDeployPayload(
  input: PoolCreateInput,
  owner: string,
  chainId: number,
): PoolDeployPayload {
  if (input.pricing === "oracle" && !hasPoolOracleBaseCurrency(input.unitOfAccount, chainId)) {
    throw new PoolOracleUnavailableError();
  }
  const baseCurrency =
    input.pricing === "oracle"
      ? getPoolOracleBaseCurrency(input.unitOfAccount, chainId)
      : undefined;

  const feesDecoupled = Number(input.feePolicyDefault) > 0 && input.feesDecoupled;
  // Fees held in liquidity have no recipient. Held apart, they go to the
  // address the steward named, or to the owner when they left it blank.
  const feeAddress = input.feeAddress.trim();

  return {
    name: input.name.trim(),
    symbol: input.symbol.trim(),
    decimals: "6",
    owner,
    quoterType: input.pricing,
    feesDecoupled,
    feePolicyDefault: input.feePolicyDefault,
    ...(feesDecoupled ? { feeAddress: feeAddress ? getAddress(feeAddress) : owner } : {}),
    ...(baseCurrency ? { baseCurrency } : {}),
    unitOfAccount: input.unitOfAccount,
    description: input.description.trim(),
    ...(input.email.trim() ? { email: input.email.trim() } : {}),
    ...(input.website.trim() ? { website: input.website.trim() } : {}),
    ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.terms.trim() ? { terms: input.terms.trim() } : {}),
    ...(input.imageUrl?.trim() ? { imageUrl: input.imageUrl.trim() } : {}),
    locationName: input.location.locationName,
    geoLat: input.location.lat,
    geoLng: input.location.lng,
    tags: input.tags,
  };
}

const POOL_DEPLOYMENT_STAGES = [
  { types: ["POOL_TOKEN_INDEX_DEPLOY"], key: "registry" },
  { types: ["POOL_LIMITER_DEPLOY"], key: "limits" },
  { types: ["POOL_FEE_POLICY_DEPLOY"], key: "feePolicy" },
  { types: ["POOL_ORACLE_QUOTER_DEPLOY", "POOL_RELATIVE_QUOTER_DEPLOY"], key: "pricing" },
  { types: ["POOL_PROXY_DEPLOY"], key: "pool" },
] as const satisfies readonly { types: readonly string[]; key: string }[];

export type PoolDeploymentStageKey = (typeof POOL_DEPLOYMENT_STAGES)[number]["key"];
export type PoolDeploymentStageState = "done" | "active" | "failed" | "idle";
export type PoolDeploymentStage = {
  label: string;
  state: PoolDeploymentStageState;
  status: string;
};

type PoolDeploymentRecord = {
  otxType: string;
  status?: string;
};

type PoolDeploymentStatusLabels = {
  confirmed: string;
  inNetwork: string;
  failed: string;
  reverted: string;
  queued: string;
  notSent: string;
};

export function poolDeploymentContractCount(pricing: PoolPricing): number {
  return pricing === "decimal" ? POOL_DEPLOYMENT_STAGES.length - 1 : POOL_DEPLOYMENT_STAGES.length;
}

export function getPoolDeploymentStages(
  records: readonly PoolDeploymentRecord[],
  labels: Record<PoolDeploymentStageKey, string>,
  statusLabels: PoolDeploymentStatusLabels,
  pricing?: PoolPricing,
): PoolDeploymentStage[] {
  const pricingDefinition = POOL_DEPLOYMENT_STAGES.find(
    (definition) => definition.key === "pricing",
  );
  const hasPricingRecord = records.some((record) =>
    pricingDefinition?.types.some((type) => type === record.otxType),
  );
  const omitPricing = pricing === "decimal" || (records.length > 0 && !hasPricingRecord);
  const definitions = omitPricing
    ? POOL_DEPLOYMENT_STAGES.filter((definition) => definition.key !== "pricing")
    : POOL_DEPLOYMENT_STAGES;
  let terminalSeen = false;

  return definitions.map((definition, index) => {
    const record = records.find((candidate) =>
      definition.types.some((type) => type === candidate.otxType),
    );
    const status = record?.status ?? "";

    if (status === "SUCCESS") {
      return {
        label: labels[definition.key],
        state: "done",
        status: statusLabels.confirmed,
      };
    }
    if (record && isTerminalOtxFailure(status)) {
      terminalSeen = true;
      return {
        label: labels[definition.key],
        state: "failed",
        status: status === "REVERTED" ? statusLabels.reverted : statusLabels.failed,
      };
    }
    if (!terminalSeen && (record || (records.length === 0 && index === 0))) {
      terminalSeen = true;
      return {
        label: labels[definition.key],
        state: "active",
        status: statusLabels.inNetwork,
      };
    }
    return {
      label: labels[definition.key],
      state: "idle",
      status: records.length > 0 ? statusLabels.queued : statusLabels.notSent,
    };
  });
}

/**
 * Deposit headroom for one voucher, as its recorded limiter cap decides it.
 *
 * Every conclusion is a statement about the **catalog**, which mirrors the chain
 * and can lag it or miss a field entirely — pools imported from federation carry
 * no dependency addresses at all. An absent value is reported as unrecorded
 * rather than as a zero, because the two have opposite consequences on SwapPool.
 */
export type PoolDepositCap =
  /** No limiter on the pool: `mustWithinLimit` returns early and nothing is capped. */
  | { kind: "uncapped" }
  /** A limiter is recorded but the catalog holds no cap for this voucher. */
  | { kind: "unrecorded" }
  /** A recorded cap of zero. `balance + value > 0` for any deposit, so all revert. */
  | { kind: "blocked" }
  | { kind: "capped"; raw: string };

/**
 * Structural rather than typed against `UserPool` / `PoolVoucher`: those live in
 * `@clc/api`, which core cannot import, and the rule needs one field from each.
 */
export function poolDepositCap(
  pool: { limiterAddress: string | null },
  voucher: { tokenLimit: string | null },
): PoolDepositCap {
  if (!pool.limiterAddress) return { kind: "uncapped" };
  if (voucher.tokenLimit === null) return { kind: "unrecorded" };
  // Normalized upstream to a run of digits, so a leading-zero string is still
  // zero and must not be read as a cap.
  if (/^0+$/.test(voucher.tokenLimit)) return { kind: "blocked" };
  return { kind: "capped", raw: voucher.tokenLimit };
}

/**
 * How much more of a voucher the pool will accept, in raw base units.
 *
 * `SwapPool.mustWithinLimit` reverts `LimitExceeded` unless
 * `balanceOf(pool) + value <= limitOf(token, pool)`, so this is the largest
 * `value` a deposit — and therefore the input side of a swap — may carry.
 *
 * Null where there is no number to give: an uncapped pool has no ceiling, and an
 * unrecorded cap is one nothing has told us about. Neither is zero, and a caller
 * that conflated them would refuse a swap the contract would have taken.
 */
export function poolDepositHeadroomRaw(cap: PoolDepositCap, poolBalanceRaw: string): string | null {
  if (cap.kind === "blocked") return "0";
  if (cap.kind !== "capped") return null;
  try {
    const left = BigInt(cap.raw) - BigInt(poolBalanceRaw);
    return left > 0n ? left.toString() : "0";
  } catch {
    return null;
  }
}
