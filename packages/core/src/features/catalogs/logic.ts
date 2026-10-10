import { z } from "zod";
import { storedImageUrlSchema } from "../../lib/image-url";

export const catalogIdSchema = z
  .union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive()])
  .transform(String);
export const catalogKindSchema = z.enum(["pool", "voucher"]);
export type CatalogKind = z.infer<typeof catalogKindSchema>;

export const catalogWriteSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .refine(
      (name) => Array.from(name).length <= 120,
      "Display name must be 120 characters or fewer",
    ),
  imageUrl: storedImageUrlSchema,
  locationName: z.string().trim().min(1, "Choose a location").max(200),
  geoLat: z.number().min(-90).max(90),
  geoLng: z.number().min(-180).max(180),
});
export type CatalogWrite = z.infer<typeof catalogWriteSchema>;

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((address) => address as `0x${string}`);
const imageSchema = storedImageUrlSchema.nullable();
export const catalogSchema = z.object({
  id: catalogIdSchema,
  name: z.string(),
  imageUrl: imageSchema,
  locationName: z.string(),
  geoLat: z.number().min(-90).max(90),
  geoLng: z.number().min(-180).max(180),
  ownerAddress: addressSchema,
  poolCount: z.number().int().nonnegative(),
  voucherCount: z.number().int().nonnegative(),
  distanceMeters: z.number().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const catalogMemberSchema = z.object({
  id: catalogIdSchema,
  chainId: z.number().int().positive(),
  address: addressSchema,
  name: z.string(),
  imageUrl: imageSchema,
});
export type CatalogMember = z.infer<typeof catalogMemberSchema>;

/** A validated create-first intent. No arbitrary redirect URL is accepted. */
export const catalogCreateIntentSchema = z.object({
  kind: catalogKindSchema,
  resourceId: catalogIdSchema,
  address: addressSchema,
});
export type CatalogCreateIntent = z.infer<typeof catalogCreateIntentSchema>;

export function parseCatalogCreateSearch(
  search: Record<string, unknown>,
): Partial<CatalogCreateIntent> {
  const result = catalogCreateIntentSchema.safeParse(search);
  return result.success ? result.data : {};
}
