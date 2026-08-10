import { z } from "zod";
import { optionalEmailSchema, optionalPhoneSchema } from "../../lib/contact";
import { tokenDecimalsSchema } from "../../lib/token";
import { locationSchema } from "../location/logic";

export const voucherNameSchema = z
  .string()
  .trim()
  .min(1, { message: "Voucher name is required" })
  .max(80, { message: "Voucher name must be 80 characters or fewer" });

export const voucherSymbolSchema = z
  .string()
  .trim()
  .min(1, { message: "Voucher symbol is required" })
  .max(6, { message: "Voucher symbol must be 6 characters or fewer" })
  .regex(/^[A-Z0-9]+$/, { message: "Use only letters and numbers for the voucher symbol" });

export const voucherValueSchema = z
  .string()
  .trim()
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
    message: "Voucher value must be greater than zero",
  });

export const voucherDescriptionSchema = z
  .string()
  .trim()
  .min(1, { message: "Voucher description is required" })
  .max(500, { message: "Voucher description must be 500 characters or fewer" });

export const voucherTermsSchema = z.literal(true, {
  error: "Accept the terms to publish your voucher",
});

const voucherUnitSchema = z.enum(["KES", "USD", "HOUR"]);
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

export function voucherExpiryDateSchema(type: VoucherType) {
  return z.string().superRefine((value, ctx) => {
    checkExpiryDate(type, value, (message) => ctx.addIssue({ code: "custom", message }));
  });
}

const voucherDetailsSchema = z.object({
  name: voucherNameSchema,
  symbol: voucherSymbolSchema,
  voucherValue: voucherValueSchema,
  voucherUoa: voucherUnitSchema,
  description: voucherDescriptionSchema,
  voucherType: voucherTypeSchema,
  expiryDate: z.string(),
  decimals: tokenDecimalsSchema,
});

const voucherPlaceSchema = z.object({
  location: locationSchema,
  tags: z.array(z.string()),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
});

export const voucherCreateSchema = voucherDetailsSchema
  .extend(voucherPlaceSchema.shape)
  .extend({ acceptedTerms: voucherTermsSchema })
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
  phone?: string;
  voucherUoa: string;
  voucherValue: number;
  locationName: string;
  geoLat: number;
  geoLng: number;
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
    ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
    voucherUoa: input.voucherUoa,
    voucherValue: Number(input.voucherValue),
    locationName: input.location.locationName,
    geoLat: input.location.lat,
    geoLng: input.location.lng,
    tags: input.tags,
  };
}
