import { encodeFunctionData, isAddress, parseAbi, zeroAddress } from "viem";
import { z } from "zod";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalTermsSchema,
  optionalWebsiteSchema,
} from "../../lib/contact";
import { isUnitOfAccount, normalizeUnitOfAccount, type UnitOfAccount } from "../../lib/currencies";
import { optionalStoredImageUrlSchema } from "../../lib/image-url";
import { tokenDecimalsSchema } from "../../lib/token";
import { locationSchema } from "../location/logic";
import {
  type MarkerColor,
  type MarkerIcon,
  markerColorSchema,
  markerIconSchema,
} from "../markers/logic";
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

const voucherDisplayNameSchema = z
  .string()
  .trim()
  .min(1, { message: "Display name is required" })
  .max(120, { message: "Display name must be 120 characters or fewer" });

/**
 * The text of a deployed voucher's catalog record, as its owner or a steward may
 * correct it after the fact. Description and value reuse the publish rules so a
 * voucher cannot be edited into a state its create form would have rejected,
 * but both also accept "" because clearing a field is a legitimate correction
 * and imported rows may never have had one. Terms is validated by length only;
 * a form with a link/text switch applies the narrower schema per mode.
 */
export const voucherProfileTextSchema = z.object({
  displayName: voucherDisplayNameSchema,
  description: voucherDescriptionSchema.or(z.literal("")),
  voucherUoa: z
    .string()
    .trim()
    .transform((value) => (value ? normalizeUnitOfAccount(value) : ""))
    .refine((value) => value === "" || isUnitOfAccount(value), {
      message: "Use 32 characters or fewer",
    }),
  voucherValue: voucherPriceSchema.or(z.literal("")),
  email: optionalEmailSchema,
  website: optionalWebsiteSchema,
  phone: optionalPhoneSchema,
  terms: optionalTermsSchema,
});

export const voucherUnitSchema = z.custom<UnitOfAccount>(isUnitOfAccount, {
  message: "Choose a unit of account",
});
const voucherTypeSchema = z.enum(["standard", "expiring"]);
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

/**
 * The opening supply is chosen while creating the voucher but minted only once
 * the contract exists. Decimals are a form field until then and come from the
 * deployed contract afterwards, so the schema is built per voucher.
 */
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

/** Field-level variant over the form's decimals string; an unparseable decimals
 * value already fails its own field, so supply is checked as whole units. */
export function voucherSupplySchema(decimals: string) {
  const parsed = tokenDecimalsSchema.safeParse(decimals);
  return voucherMintAmountSchema(parsed.success ? Number(parsed.data) : 0);
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
  supply: z.string(),
});

const voucherPlaceSchema = z.object({
  location: locationSchema,
  tags: z.array(z.string()),
  email: optionalEmailSchema,
  website: optionalWebsiteSchema,
  phone: optionalPhoneSchema,
  terms: optionalTermsSchema,
  iconUrl: optionalStoredImageUrlSchema,
  bannerUrl: optionalStoredImageUrlSchema,
  /** Null leaves the pin to follow what the voucher offers. */
  markerIcon: markerIconSchema.nullable(),
  markerColor: markerColorSchema.nullable(),
});

export const voucherCreateSchema = voucherDetailsSchema
  .extend(voucherPlaceSchema.shape)
  .extend({
    acceptedTerms: voucherTermsSchema,
  })
  .superRefine((value, ctx) => {
    checkExpiryDate(value.voucherType, value.expiryDate, (message) =>
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message }),
    );
    const supply = voucherSupplySchema(value.decimals).safeParse(value.supply);
    if (!supply.success) {
      ctx.addIssue({
        code: "custom",
        path: ["supply"],
        message: supply.error.issues[0]?.message ?? "Supply must be greater than zero",
      });
    }
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
  /** Omitted, not null, when the issuer kept the automatic pin. */
  markerIcon?: MarkerIcon;
  markerColor?: MarkerColor;
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
    ...(input.markerIcon ? { markerIcon: input.markerIcon } : {}),
    ...(input.markerColor ? { markerColor: input.markerColor } : {}),
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
export const giftableTokenOwnershipAbi = parseAbi(["function transferOwnership(address newOwner)"]);
export const giftableTokenTotalSupplyAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
]);

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

export type BuildVoucherOwnershipTransferCallInput = {
  tokenAddress: `0x${string}`;
  newOwnerAddress: `0x${string}`;
};

/**
 * GiftableToken inherits Solady's `transferOwnership(address)`. Ownership is
 * deliberately transferred by the current owner through Calibur, rather than
 * trusting a catalog-profile edit to change an on-chain authority.
 */
export function buildVoucherOwnershipTransferCall(
  input: BuildVoucherOwnershipTransferCallInput,
): CaliburCall {
  return {
    to: input.tokenAddress,
    value: "0",
    data: encodeFunctionData({
      abi: giftableTokenOwnershipAbi,
      functionName: "transferOwnership",
      args: [input.newOwnerAddress],
    }),
  };
}

/**
 * Writers may call `mintTo`. The owner is always a writer (`isWriter` returns
 * true for `owner()`), so deleting the owner does not remove their mint right.
 * Adding or deleting a writer is `onlyOwner`.
 */
export const giftableTokenWriterAbi = parseAbi([
  "function addWriter(address minter) returns (bool)",
  "function deleteWriter(address minter) returns (bool)",
  "function isWriter(address minter) view returns (bool)",
]);

function assertVoucherParty(address: `0x${string}`, label: string): void {
  if (!isAddress(address) || address.toLowerCase() === zeroAddress) {
    throw new Error(`Voucher ${label} must be a non-zero address.`);
  }
}

export function buildAddVoucherWriterCall(input: {
  tokenAddress: `0x${string}`;
  writerAddress: `0x${string}`;
}): CaliburCall {
  assertVoucherParty(input.tokenAddress, "token");
  assertVoucherParty(input.writerAddress, "writer");
  return {
    to: input.tokenAddress,
    value: "0",
    data: encodeFunctionData({
      abi: giftableTokenWriterAbi,
      functionName: "addWriter",
      args: [input.writerAddress],
    }),
  };
}

export function buildDeleteVoucherWriterCall(input: {
  tokenAddress: `0x${string}`;
  writerAddress: `0x${string}`;
}): CaliburCall {
  assertVoucherParty(input.tokenAddress, "token");
  assertVoucherParty(input.writerAddress, "writer");
  return {
    to: input.tokenAddress,
    value: "0",
    data: encodeFunctionData({
      abi: giftableTokenWriterAbi,
      functionName: "deleteWriter",
      args: [input.writerAddress],
    }),
  };
}
