import { encodeFunctionData, parseAbi } from "viem";
import { z } from "zod";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsUrlSchema,
  optionalWebsiteSchema,
} from "../../lib/contact";
import { isUnitOfAccount, type UnitOfAccount } from "../../lib/currencies";
import { tokenDecimalsSchema } from "../../lib/token";
import { locationSchema } from "../location/logic";
import type { CaliburCall } from "../webauthn/index";

export const voucherNameSchema = z
  .string()
  .trim()
  .min(3, { message: "Voucher name must be at least 3 characters" })
  .max(80, { message: "Voucher name must be 80 characters or fewer" });

export const voucherSymbolSchema = z
  .string()
  .trim()
  .min(3, { message: "Voucher symbol must be at least 3 characters" })
  .max(6, { message: "Voucher symbol must be 6 characters or fewer" })
  .regex(/^[A-Z0-9]+$/, { message: "Use only letters and numbers for the voucher symbol" });

export const voucherPriceSchema = z
  .string()
  .trim()
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
    message: "Price must be greater than zero",
  });

export const voucherDescriptionSchema = z
  .string()
  .trim()
  .min(3, { message: "Voucher description must be at least 3 characters" })
  .max(500, { message: "Voucher description must be 500 characters or fewer" });

export const voucherTermsSchema = z.literal(true, {
  error: "Accept the terms to publish your voucher",
});

export const voucherPathLicenseSchema = z.literal(true, {
  error: "Accept the PATH License to publish your voucher",
});

export const voucherUnitSchema = z.custom<UnitOfAccount>(isUnitOfAccount, {
  message: "Choose a currency",
});
const voucherTypeSchema = z.enum(["standard", "expiring"]);
const optionalVoucherImageUrlSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^https?:\/\//i.test(value), {
    message: "The image must be an http(s) URL",
  })
  .optional();

export type VoucherUnit = z.infer<typeof voucherUnitSchema>;
export type VoucherType = z.infer<typeof voucherTypeSchema>;

/** An expiring voucher needs a future date; a standard one ignores the field. */
function checkExpiryDate(
  type: VoucherType,
  expiryDate: string,
  addIssue: (message: string) => void,
): void {
  if (type !== "expiring") return;
  const expiry = Date.parse(`${expiryDate}T00:00:00Z`);
  if (!expiryDate || !Number.isFinite(expiry)) {
    addIssue("Choose an expiration date");
    return;
  }
  if (expiry <= Date.now()) addIssue("Expiration date must be in the future");
}

export function voucherExpiryDateSchema(type: VoucherType) {
  return z.string().superRefine((value, ctx) => {
    checkExpiryDate(type, value, (message) => ctx.addIssue({ code: "custom", message }));
  });
}

const voucherDetailsSchema = z.object({
  name: voucherNameSchema,
  symbol: voucherSymbolSchema,
  price: voucherPriceSchema,
  unitOfAccount: voucherUnitSchema,
  description: voucherDescriptionSchema,
  voucherType: voucherTypeSchema,
  expiryDate: z.string(),
  decimals: tokenDecimalsSchema,
});

const voucherPlaceSchema = z.object({
  location: locationSchema,
  tags: z.array(z.string()),
  email: optionalEmailSchema,
  website: optionalWebsiteSchema,
  phone: optionalPhoneSchema,
  terms: optionalTermsUrlSchema,
  iconUrl: optionalVoucherImageUrlSchema,
  bannerUrl: optionalVoucherImageUrlSchema,
});

export const voucherCreateSchema = voucherDetailsSchema
  .extend(voucherPlaceSchema.shape)
  .extend({
    acceptedTerms: voucherTermsSchema,
    acceptedPathLicense: voucherPathLicenseSchema,
  })
  .superRefine((value, ctx) => {
    checkExpiryDate(value.voucherType, value.expiryDate, (message) =>
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message }),
    );
  });

export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;

export type VoucherDeployPayload = {
  name: string;
  symbol: string;
  decimals: string;
  owner: string;
  expiryTimestamp?: string;
  description: string;
  email?: string;
  website?: string;
  phone?: string;
  terms?: string;
  voucherUoa: string;
  voucherValue: number;
  locationName: string;
  geoLat: number;
  geoLng: number;
  /**
   * Off-chain catalog metadata, carried through the deploy so a voucher created
   * with an icon has one the moment its address exists. clc-core validates both
   * as `http_url` before it queues the job — the catalog column that receives
   * them refuses anything else, and rejecting it in the worker would mean a
   * signed transaction with no catalog row — so omit them rather than sending an
   * empty string.
   */
  iconUrl?: string;
  bannerUrl?: string;
  tags: string[];
};

export function toVoucherDeployPayload(
  input: VoucherCreateInput,
  owner: string,
): VoucherDeployPayload {
  const expiryTimestamp =
    input.voucherType === "expiring"
      ? String(Math.floor(Date.parse(`${input.expiryDate}T00:00:00Z`) / 1_000))
      : undefined;

  return {
    name: input.name.trim(),
    symbol: input.symbol.trim(),
    decimals: input.decimals,
    owner,
    ...(expiryTimestamp ? { expiryTimestamp } : {}),
    description: input.description.trim(),
    ...(input.email.trim() ? { email: input.email.trim() } : {}),
    ...(input.website.trim() ? { website: input.website.trim() } : {}),
    ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.terms.trim() ? { terms: input.terms.trim() } : {}),
    ...(input.iconUrl?.trim() ? { iconUrl: input.iconUrl.trim() } : {}),
    ...(input.bannerUrl?.trim() ? { bannerUrl: input.bannerUrl.trim() } : {}),
    voucherUoa: input.unitOfAccount,
    voucherValue: Number(input.price),
    locationName: input.location.locationName,
    geoLat: input.location.lat,
    geoLng: input.location.lng,
    tags: input.tags,
  };
}

/**
 * A voucher deploys with zero supply: `initialize()` only assigns ownership, so
 * the platform signer has no minting authority afterwards (`mintTo` is
 * `onlyWriter` = owner or writers). The issuer owns the token from the deploy
 * tx onward, so they mint their own opening supply through the relayer.
 */
export const giftableTokenMintToAbi = parseAbi(["function mintTo(address to, uint256 amount)"]);
export const giftableTokenTotalSupplyAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
]);

/** Decimals come from the deployed contract, so the schema is built per voucher. */
export function voucherMintAmountSchema(decimals: number) {
  return z
    .string()
    .trim()
    .refine((value) => /^\d+(\.\d+)?$/.test(value) && Number(value) > 0, {
      message: "Supply must be greater than zero",
    })
    .refine((value) => (value.split(".")[1]?.length ?? 0) <= decimals, {
      message: "Supply has more decimal places than this voucher supports",
    });
}

export type BuildVoucherMintCallInput = {
  tokenAddress: `0x${string}`;
  /** Always the issuer's own wallet — the voucher owner mints to themselves. */
  ownerAddress: `0x${string}`;
  amountRaw: string;
};

export function buildVoucherMintCall(input: BuildVoucherMintCallInput): CaliburCall {
  if (!/^\d+$/.test(input.amountRaw)) {
    throw new Error("Voucher supply must be a positive integer string.");
  }
  const amount = BigInt(input.amountRaw);
  if (amount <= 0n) throw new Error("Voucher supply must be positive.");

  return {
    to: input.tokenAddress,
    value: "0",
    data: encodeFunctionData({
      abi: giftableTokenMintToAbi,
      functionName: "mintTo",
      args: [input.ownerAddress, amount],
    }),
  };
}
