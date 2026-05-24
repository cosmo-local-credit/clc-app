import { z } from "zod";

// ── Schema ─────────────────────────────────────────────────────────────────────

const emailValidator = (val: string) =>
	val === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

// E.164: + followed by 1–15 digits
const phoneValidator = (val: string) =>
	val === "" || /^\+[1-9]\d{1,14}$/.test(val);

// ISO 3166-1 alpha-2
const countryValidator = (val: string) => val === "" || /^[A-Z]{2}$/.test(val);

export const profileSchema = z.object({
	name: z.string().max(80, { message: "Name must be 80 characters or fewer" }),
	email: z
		.string()
		.refine(emailValidator, { message: "Invalid email address" }),
	phone: z.string().refine(phoneValidator, { message: "Invalid phone number" }),
	country: z.string().refine(countryValidator, { message: "Invalid country" }),
});

export type ProfileInput = z.infer<typeof profileSchema>;
