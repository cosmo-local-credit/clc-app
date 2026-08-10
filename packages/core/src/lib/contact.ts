import { z } from "zod";

/**
 * Contact details are optional per field but validated identically everywhere
 * they are collected (signup profile, voucher issuer contact). An empty string
 * means "not provided"; callers decide whether that is acceptable.
 */
export const optionalEmailSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "Invalid email address",
  });

/** E.164: leading `+`, no zero-prefixed country code, 8–15 digits total. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\+[1-9]\d{7,14}$/.test(value), {
    message: "Invalid phone number",
  });
