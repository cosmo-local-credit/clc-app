import { z } from "zod";
import { storedImageUrlSchema } from "../../lib/image-url";
import { markerColorSchema, markerIconSchema } from "../markers/logic";
import { wantMarkerIconSchema } from "../wants/logic";

export const marketplaceScopeSchema = z.enum(["offers", "wants", "vouchers", "pools", "catalogs"]);
export type MarketplaceScope = z.infer<typeof marketplaceScopeSchema>;

const marketplaceKindSchema = z.enum(["offering", "want", "voucher", "pool", "catalog"]);
export type MarketplaceKind = z.infer<typeof marketplaceKindSchema>;

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const nullableText = z.string().nullable();
const baseResultSchema = z.object({
  id: z.union([z.string(), z.number().int().positive()]).transform(String),
  name: z.string(),
  description: nullableText,
  imageUrl: storedImageUrlSchema.nullable(),
  markerIcon: markerIconSchema.nullable(),
  markerColor: markerColorSchema.nullable(),
  voucherKind: z.null(),
  locationName: nullableText,
  geoLat: z.number().min(-90).max(90),
  geoLng: z.number().min(-180).max(180),
  distanceMeters: z.number().nonnegative().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const marketplaceOfferingResultSchema = baseResultSchema.extend({
  kind: z.literal("offering"),
  chainId: z.number().int().positive(),
  address: addressSchema,
  symbol: nullableText,
  voucherAddress: addressSchema,
  voucherName: nullableText,
  voucherSymbol: nullableText,
  voucherUoa: nullableText,
  priceInUnitOfAccount: nullableText,
  unit: nullableText,
  poolCount: z.null(),
  voucherCount: z.null(),
});

const marketplaceVoucherResultSchema = baseResultSchema.extend({
  kind: z.literal("voucher"),
  chainId: z.number().int().positive(),
  address: addressSchema,
  symbol: nullableText,
  voucherAddress: z.null(),
  voucherName: z.null(),
  voucherSymbol: z.null(),
  voucherUoa: z.null(),
  priceInUnitOfAccount: z.null(),
  unit: z.null(),
  poolCount: z.null(),
  voucherCount: z.null(),
  voucherKind: z.enum(["goods", "services", "voucher"]),
});

const marketplacePoolResultSchema = baseResultSchema.extend({
  kind: z.literal("pool"),
  chainId: z.number().int().positive(),
  address: addressSchema,
  symbol: nullableText,
  voucherAddress: z.null(),
  voucherName: z.null(),
  voucherSymbol: z.null(),
  voucherUoa: z.null(),
  priceInUnitOfAccount: z.null(),
  unit: z.null(),
  poolCount: z.null(),
  voucherCount: z.number().int().nonnegative(),
});

const marketplaceCatalogResultSchema = baseResultSchema.extend({
  kind: z.literal("catalog"),
  chainId: z.null(),
  address: z.null(),
  symbol: z.null(),
  voucherAddress: z.null(),
  voucherName: z.null(),
  voucherSymbol: z.null(),
  voucherUoa: z.null(),
  priceInUnitOfAccount: z.null(),
  unit: z.null(),
  poolCount: z.number().int().nonnegative(),
  voucherCount: z.number().int().nonnegative(),
});

const marketplaceWantResultSchema = baseResultSchema.extend({
  kind: z.literal("want"),
  chainId: z.null(),
  address: z.null(),
  symbol: z.null(),
  markerIcon: wantMarkerIconSchema,
  markerColor: markerColorSchema,
  voucherAddress: z.null(),
  voucherName: z.null(),
  voucherSymbol: z.null(),
  voucherUoa: z.null(),
  priceInUnitOfAccount: z.null(),
  unit: z.null(),
  poolCount: z.null(),
  voucherCount: z.null(),
});

export const marketplaceResultSchema = z.discriminatedUnion("kind", [
  marketplaceOfferingResultSchema,
  marketplaceWantResultSchema,
  marketplaceVoucherResultSchema,
  marketplacePoolResultSchema,
  marketplaceCatalogResultSchema,
]);
export type MarketplaceResult = z.infer<typeof marketplaceResultSchema>;
