import { z } from "zod";
import { isHttpUrl } from "../../lib/contact";
import { CUSTOM_UNIT_MAX_LENGTH } from "../vocabulary/logic";

/**
 * The built-in offering units shipped with every deployment.
 *
 * Custom units are loaded from clc-core at runtime. This list remains the label
 * registry for built-ins so apps can translate them without treating arbitrary
 * user text as a message id.
 *
 * Lower-case because the lookup is: the label an operator or a member reads is a
 * separate concern, owned by whichever app is rendering it. `apps/admin` keeps an
 * English option list, `apps/web` builds a translated one. Neither belongs here —
 * this package is platform-agnostic and carries no locale policy.
 */
export const OFFERING_UNITS = [
  "kg",
  "g",
  "litre",
  "item",
  "hour",
  "day",
  "bag",
  "unit",
  "bundle",
  "piece",
  "dozen",
  "serving",
  "trip",
  "session",
  "metre",
] as const;

export type OfferingUnit = (typeof OFFERING_UNITS)[number];

export function isOfferingUnit(value: unknown): value is OfferingUnit {
  return typeof value === "string" && (OFFERING_UNITS as readonly string[]).includes(value);
}

/**
 * A price per unit, as text.
 *
 * Plain decimal only: no exponent, no thousands separator, no sign. The value
 * travels as a string from this field to PostgreSQL `NUMERIC` and back out
 * through `::TEXT`, so it is never rounded — a price may carry more digits than a
 * double holds exactly, and `Number("12345678901234567890.12345")` is already
 * wrong before it reaches the network.
 *
 * Zero is rejected here rather than by the regexp, which cannot express it
 * without becoming unreadable. The comparison is textual for the same reason the
 * value is: parsing it to check would reintroduce the rounding.
 */
const offeringPricePerUnitSchema = z
  .string()
  .trim()
  .min(1, { message: "Enter a price per unit" })
  .regex(/^\d+(\.\d+)?$/, {
    message: "Enter a plain number, for example 120.50",
  })
  .refine((value) => !/^0+(\.0+)?$/.test(value), {
    message: "Price must be greater than zero",
  });

const offeringNameSchema = z
  .string()
  .trim()
  .min(1, { message: "Enter what you are offering" })
  .max(120, { message: "Name must be 120 characters or fewer" });

const offeringDescriptionSchema = z
  .string()
  .trim()
  .min(1, { message: "Describe what you are offering" })
  .max(2000, { message: "Description must be 2,000 characters or fewer" });

/**
 * The stored photo, or nothing.
 *
 * A URL, never a `File`. The bytes go to storage first and only the URL it
 * returns is persisted, so by the time a value reaches this schema the upload has
 * already happened. The scheme check mirrors the column's own constraint: a data
 * URI is not a durable reference and clc-core will refuse it.
 */
const offeringImageUrlSchema = z
  .string()
  .trim()
  .refine((value) => isHttpUrl(value), {
    message: "The photo must be an uploaded image URL",
  })
  .nullable();

const offeringUnitSchema = z
  .string()
  .trim()
  .min(1, { message: "Choose a unit" })
  .max(CUSTOM_UNIT_MAX_LENGTH, { message: "Unit must be 32 characters or fewer" });

/**
 * The five fields an issuer owns.
 *
 * Absent on purpose: the voucher (immutable, and part of the URL), the seller
 * (server-selected from the locked voucher owner), and every legacy import column
 * — quantity, frequency, location, geo, provenance. A form built from this schema
 * cannot offer a field the server would ignore.
 */
export const offeringWriteSchema = z.object({
  name: offeringNameSchema,
  description: offeringDescriptionSchema,
  unit: offeringUnitSchema,
  pricePerUnit: offeringPricePerUnitSchema,
  imageUrl: offeringImageUrlSchema,
});

export type OfferingWrite = z.infer<typeof offeringWriteSchema>;

/** Blank form values. The issuer must choose a unit. */
export const emptyOfferingWrite: {
  name: string;
  description: string;
  unit: string;
  pricePerUnit: string;
  imageUrl: string | null;
} = {
  name: "",
  description: "",
  unit: "",
  pricePerUnit: "",
  imageUrl: null,
};
