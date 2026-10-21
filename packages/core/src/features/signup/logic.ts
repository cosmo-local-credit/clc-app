import { z } from "zod";
import { isUnitOfAccount } from "../../lib/currencies";
import { optionalEmailSchema, optionalPhoneSchema, optionalWebsiteSchema } from "../../lib/contact";
import { locationSchema } from "../location/logic";

const nameSchema = z
  .string()
  .min(1, { message: "Name is required" })
  .max(80, { message: "Name must be 80 characters or fewer" });

export const usernameSchema = z
  .string()
  .transform((value) => value.trim().normalize("NFC"))
  .refine((value) => Array.from(value).length <= 80, {
    message: "Username must contain 1–80 characters",
  });

const preferredCurrencySchema = z
  .string()
  // Keep the form value's TypeScript shape as `string`; the runtime catalog
  // check still rejects unsupported values, while TanStack Form needs the
  // input and output shapes of its Standard Schema to match.
  .refine((value): boolean => isUnitOfAccount(value), {
    message: "Choose a preferred unit of account",
  });

const bioSchema = z.string().trim().max(500, { message: "Bio must be 500 characters or fewer" });

function requireEmailOrPhone(data: { email: string; phone: string }, ctx: z.RefinementCtx) {
  if (!data.email && !data.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide an email or phone number",
      path: ["email"],
    });
  }
}

export const profileSchema = z
  .object({
    name: nameSchema,
    username: usernameSchema.optional(),
    email: optionalEmailSchema,
    phone: optionalPhoneSchema,
    location: locationSchema,
    preferredCurrency: preferredCurrencySchema,
    bio: bioSchema,
    website: optionalWebsiteSchema,
  })
  .superRefine(requireEmailOrPhone);

export type ProfileInput = z.infer<typeof profileSchema>;

export const profileEditSchema = z
  .object({
    name: nameSchema,
    email: optionalEmailSchema,
    phone: optionalPhoneSchema,
    location: locationSchema.optional(),
    preferredCurrency: preferredCurrencySchema,
    bio: bioSchema,
    website: optionalWebsiteSchema,
  })
  .superRefine(requireEmailOrPhone);

export type ProfileEditInput = z.infer<typeof profileEditSchema>;
