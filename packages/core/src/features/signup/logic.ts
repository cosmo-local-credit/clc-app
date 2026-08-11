import { z } from "zod";
import { optionalEmailSchema, optionalPhoneSchema } from "../../lib/contact";
import { locationSchema } from "../location/logic";

const nameSchema = z
  .string()
  .min(1, { message: "Name is required" })
  .max(80, { message: "Name must be 80 characters or fewer" });

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
    email: optionalEmailSchema,
    phone: optionalPhoneSchema,
    location: locationSchema,
  })
  .superRefine(requireEmailOrPhone);

export type ProfileInput = z.infer<typeof profileSchema>;
