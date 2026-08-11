import { z } from "zod";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsUrlSchema,
  optionalWebsiteSchema,
} from "../../lib/contact";
import {
  CELO_MAINNET_CHAIN_ID,
  CELO_MAINNET_CKES_ADDRESS,
  CELO_MAINNET_CUSD_ADDRESS,
} from "../../lib/constants/celo";
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

export const poolSwapFeeSchema = z
  .string()
  .trim()
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100, {
    message: "Swap fee must be a number from 0 to 100",
  });

export const poolTermsSchema = z.literal(true, {
  error: "Accept the terms to publish your pool",
});

export const poolSproutLicenseSchema = z.literal(true, {
  error: "Accept the SPROUT License to publish your pool",
});

const poolUnitSchema = z.enum(["KES", "USD", "HOUR"]);
const poolPricingSchema = z.enum(["oracle", "relative", "decimal"]);

export type PoolUnit = z.infer<typeof poolUnitSchema>;
export type PoolPricing = z.infer<typeof poolPricingSchema>;

const CELO_MAINNET_ORACLE_BASE_CURRENCY = {
  KES: CELO_MAINNET_CKES_ADDRESS,
  USD: CELO_MAINNET_CUSD_ADDRESS,
} as const satisfies Partial<Record<PoolUnit, string>>;

function getPoolOracleBaseCurrency(unit: PoolUnit, chainId: number): string | undefined {
  if (chainId !== CELO_MAINNET_CHAIN_ID) return undefined;
  return CELO_MAINNET_ORACLE_BASE_CURRENCY[unit as keyof typeof CELO_MAINNET_ORACLE_BASE_CURRENCY];
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

export const poolCreateSchema = z
  .object({
    name: poolNameSchema,
    symbol: poolSymbolSchema,
    unit: poolUnitSchema,
    description: poolDescriptionSchema,
    pricing: poolPricingSchema,
    feePolicyDefault: poolSwapFeeSchema,
    feesDecoupled: z.boolean(),
    location: locationSchema,
    tags: z.array(z.string()),
    email: optionalEmailSchema,
    website: optionalWebsiteSchema,
    phone: optionalPhoneSchema,
    terms: optionalTermsUrlSchema,
    acceptedTerms: poolTermsSchema,
    acceptedSproutLicense: poolSproutLicenseSchema,
  })
  .superRefine((value, ctx) => {
    if (
      value.pricing !== "oracle" ||
      hasPoolOracleBaseCurrency(value.unit, CELO_MAINNET_CHAIN_ID)
    ) {
      return;
    }
    ctx.addIssue({
      code: "custom",
      path: ["unit"],
      message: "Choose rates you set or equal value when the unit has no price feed",
    });
  });

export type PoolCreateInput = z.infer<typeof poolCreateSchema>;

export type PoolDeployPayload = {
  name: string;
  symbol: string;
  decimals: string;
  owner: string;
  quoterType: PoolPricing;
  feesDecoupled: boolean;
  feePolicyDefault: string;
  baseCurrency?: string;
  description: string;
  email?: string;
  website?: string;
  phone?: string;
  terms?: string;
  locationName: string;
  geoLat: number;
  geoLng: number;
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
  if (input.pricing === "oracle" && !hasPoolOracleBaseCurrency(input.unit, chainId)) {
    throw new PoolOracleUnavailableError();
  }
  const baseCurrency =
    input.pricing === "oracle" ? getPoolOracleBaseCurrency(input.unit, chainId) : undefined;

  return {
    name: input.name.trim(),
    symbol: input.symbol.trim(),
    decimals: "6",
    owner,
    quoterType: input.pricing,
    feesDecoupled: Number(input.feePolicyDefault) > 0 && input.feesDecoupled,
    feePolicyDefault: input.feePolicyDefault,
    ...(baseCurrency ? { baseCurrency } : {}),
    description: input.description.trim(),
    ...(input.email.trim() ? { email: input.email.trim() } : {}),
    ...(input.website.trim() ? { website: input.website.trim() } : {}),
    ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.terms.trim() ? { terms: input.terms.trim() } : {}),
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
