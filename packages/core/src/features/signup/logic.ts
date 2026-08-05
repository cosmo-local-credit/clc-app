import { z } from "zod";
import { locationSchema } from "../location/logic";

const emailValidator = (val: string) => val === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

const phoneValidator = (val: string) => val === "" || /^\+[1-9]\d{1,14}$/.test(val);

const nameSchema = z
  .string()
  .min(1, { message: "Name is required" })
  .max(80, { message: "Name must be 80 characters or fewer" });

const emailSchema = z.string().refine(emailValidator, { message: "Invalid email address" });

const phoneSchema = z.string().refine(phoneValidator, { message: "Invalid phone number" });

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
    email: emailSchema,
    phone: phoneSchema,
    location: locationSchema,
  })
  .superRefine(requireEmailOrPhone);

export type ProfileInput = z.infer<typeof profileSchema>;

// Editing an existing profile now captures the same fields signup does
// (including precise location), so it reuses profileSchema rather than a
// country-only variant.
export const profileEditSchema = profileSchema;
