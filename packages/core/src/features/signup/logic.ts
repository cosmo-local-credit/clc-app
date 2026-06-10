import { z } from "zod";
import { locationSchema } from "../location/logic";

const emailValidator = (val: string) => val === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

const phoneValidator = (val: string) => val === "" || /^\+[1-9]\d{1,14}$/.test(val);

export const profileSchema = z
  .object({
    name: z
      .string()
      .min(1, { message: "Name is required" })
      .max(80, { message: "Name must be 80 characters or fewer" }),
    email: z.string().refine(emailValidator, { message: "Invalid email address" }),
    phone: z.string().refine(phoneValidator, { message: "Invalid phone number" }),
    location: locationSchema,
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide an email or phone number",
        path: ["email"],
      });
    }
  });

export type ProfileInput = z.infer<typeof profileSchema>;
