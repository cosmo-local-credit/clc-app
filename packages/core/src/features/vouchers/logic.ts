import { z } from "zod";
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

export const voucherDecimalsSchema = z
  .string()
  .trim()
  .refine((value) => /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 18, {
    message: "Decimals must be a whole number from 0 to 18",
  });

export const voucherEmailSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "Invalid email address",
  });

export const voucherPhoneSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\+[1-9]\d{7,14}$/.test(value), {
    message: "Invalid phone number",
  });

export const voucherUnitSchema = z.enum(["KES", "USD", "HOUR"]);
export const voucherTypeSchema = z.enum(["standard", "expiring"]);
export const voucherTagsSchema = z.array(z.string());
export const voucherTermsSchema = z.literal(true, {
  error: "Accept the terms to publish your voucher",
});
export const voucherLocationSchema = locationSchema;

export function voucherExpiryDateSchema(type: "standard" | "expiring") {
  return z.string().superRefine((value, ctx) => {
    if (type !== "expiring") return;
    const expiry = Date.parse(`${value}T00:00:00Z`);
    if (!value || !Number.isFinite(expiry)) {
      ctx.addIssue({ code: "custom", message: "Choose an expiration date" });
      return;
    }
    if (expiry <= Date.now()) {
      ctx.addIssue({ code: "custom", message: "Expiration date must be in the future" });
    }
  });
}

export const voucherDetailsSchema = z.object({
  name: voucherNameSchema,
  symbol: voucherSymbolSchema,
  voucherValue: voucherValueSchema,
  voucherUoa: voucherUnitSchema,
  description: voucherDescriptionSchema,
  voucherType: voucherTypeSchema,
  expiryDate: z.string(),
  decimals: voucherDecimalsSchema,
});

export const voucherPlaceSchema = z.object({
  location: voucherLocationSchema,
  tags: voucherTagsSchema,
  email: voucherEmailSchema,
  phone: voucherPhoneSchema,
});

export const voucherCreateSchema = voucherDetailsSchema
  .extend(voucherPlaceSchema.shape)
  .extend({ acceptedTerms: voucherTermsSchema })
  .superRefine((value, ctx) => {
    if (value.voucherType !== "expiring") return;
    const expiry = Date.parse(`${value.expiryDate}T00:00:00Z`);
    if (!value.expiryDate || !Number.isFinite(expiry)) {
      ctx.addIssue({
        code: "custom",
        path: ["expiryDate"],
        message: "Choose an expiration date",
      });
      return;
    }
    if (expiry <= Date.now()) {
      ctx.addIssue({
        code: "custom",
        path: ["expiryDate"],
        message: "Expiration date must be in the future",
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
