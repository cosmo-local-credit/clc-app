import { optionalTermsUrlSchema, optionalWebsiteSchema } from "../../lib/contact";
import { normalizeUnitOfAccount } from "../../lib/currencies";
import {
  buildPrefillHref,
  bySchema,
  createPrefillReader,
  definedFields,
  hasPrefillVersion,
  type ParsedPrefill,
  parsePrefillImageSource,
  parsePrefillTags,
  upperCased,
} from "../../lib/prefill";
import type { LocationInput } from "../location/logic";
import {
  hasPoolOracleBaseCurrency,
  type PoolPricing,
  type PoolUnit,
  poolDescriptionSchema,
  poolNameSchema,
  poolPricingSchema,
  poolSwapFeeSchema,
  poolSymbolSchema,
  poolUnitSchema,
} from "./logic";

/** The step a pool prefill lands on, and the only one that reads it. */
const POOL_PREFILL_PATH = "/pools/create/pool";

/**
 * What a v1 link may seed into the pool create form. Never the owner, the fee
 * recipient (a link could otherwise send a steward's fees to a stranger), the
 * terms acceptance, email or phone. `imageSource` is a URL for storage-server to
 * import, never an `imageUrl`.
 */
export type PoolPrefill = {
  name?: string;
  symbol?: string;
  description?: string;
  unitOfAccount?: PoolUnit;
  pricing?: PoolPricing;
  feePolicyDefault?: string;
  feesDecoupled?: boolean;
  location?: LocationInput;
  tags?: string[];
  website?: string;
  terms?: string;
  imageSource?: string;
};

/**
 * The step-1 route's validated search: each accepted param in its wire form.
 * String fields stay strings; only `v`, the coordinates and `feesDecoupled` may
 * arrive as something else.
 */
export type PoolPrefillSearch = Partial<
  Record<
    Exclude<keyof PoolPrefill, "location" | "feesDecoupled"> | "locationName" | "country",
    string
  > &
    Record<"v" | "lat" | "lng", number | string> &
    Record<"feesDecoupled", boolean | string>
>;

/**
 * Parses a pool prefill off the router's parsed search, or null when the link
 * carries no `v=1`. Chain-independent: `poolPrefillForChain` applies the rules
 * that depend on what the connected chain has deployed.
 */
export function parsePoolPrefill(
  search: Record<string, unknown>,
): ParsedPrefill<PoolPrefill, PoolPrefillSearch> | null {
  if (!hasPrefillVersion(search)) return null;
  const read = createPrefillReader(search);
  const values = definedFields<PoolPrefill>({
    name: read.text("name", bySchema(poolNameSchema)),
    symbol: read.text("symbol", upperCased(bySchema(poolSymbolSchema))),
    description: read.text("description", bySchema(poolDescriptionSchema)),
    unitOfAccount: read.text("unitOfAccount", (value) =>
      bySchema(poolUnitSchema)(normalizeUnitOfAccount(value)),
    ),
    pricing: read.text("pricing", bySchema(poolPricingSchema)),
    feePolicyDefault: read.text("feePolicyDefault", bySchema(poolSwapFeeSchema)),
    feesDecoupled: read.boolean("feesDecoupled"),
    location: read.location(),
    tags: read.text("tags", parsePrefillTags),
    website: read.text("website", bySchema(optionalWebsiteSchema)),
    terms: read.text("terms", bySchema(optionalTermsUrlSchema)),
    imageSource: read.text("imageSource", parsePrefillImageSource),
  });
  return { search: read.wire as PoolPrefillSearch, values };
}

/**
 * The prefill as the form may take it on this chain, given the form's own
 * defaults for the fields the link left out.
 *
 * - Under `oracle`, a unit without a price feed falls back to `relative`, the
 *   same as `syncPricingToUnit` does when someone picks that unit.
 * - `feesDecoupled` means nothing without a fee, so a zero fee drops it.
 */
export function poolPrefillForChain(
  values: PoolPrefill,
  chainId: number,
  defaults: { unitOfAccount: PoolUnit; feePolicyDefault: string },
): PoolPrefill {
  const next = { ...values };
  const unit = next.unitOfAccount ?? defaults.unitOfAccount;
  if (next.pricing === "oracle" && !hasPoolOracleBaseCurrency(unit, chainId)) {
    next.pricing = "relative";
  }
  if (Number(next.feePolicyDefault ?? defaults.feePolicyDefault) <= 0) {
    delete next.feesDecoupled;
  }
  return next;
}

/**
 * The step-1 link for these fields, encoded the way the router reads it back.
 * Throws `PrefillTooLongError` over `PREFILL_URL_MAX_BYTES`.
 */
export function poolPrefillHref(fields: PoolPrefill): string {
  return buildPrefillHref(POOL_PREFILL_PATH, fields);
}
