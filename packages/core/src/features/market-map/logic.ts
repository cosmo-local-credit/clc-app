import { z } from "zod";
import {
  markerColorSchema,
  markerIconSchema,
  reportMarkerIconSchema,
  wantMarkerIconSchema,
} from "../markers/logic";

const MARKET_MAP_KINDS = ["voucher", "want", "pool", "catalog", "post"] as const;
const marketMapKindSchema = z.enum(MARKET_MAP_KINDS);
export type MarketMapKind = z.infer<typeof marketMapKindSchema>;

const mapMarkerIconSchema = z.union([
  markerIconSchema,
  wantMarkerIconSchema,
  reportMarkerIconSchema,
]);

/** One mappable resource. The client clusters these; the server never does. */
const marketMapPointSchema = z.object({
  kind: marketMapKindSchema,
  resourceId: z.string().min(1),
  name: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  markerIcon: mapMarkerIconSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  markerColor: markerColorSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

const marketMapRelationshipFacetSchema = z.object({
  id: z.number().int().positive(),
  chainId: z.number().int().positive(),
  address: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const marketMapPointsResponseSchema = z.object({
  points: z.array(marketMapPointSchema),
  truncated: z.boolean(),
});

export const marketMapFacetsResponseSchema = z.object({
  tagFacets: z.array(z.object({ tag: z.string(), count: z.number().int().nonnegative() })),
  postVoucherFacets: z.array(marketMapRelationshipFacetSchema),
  postPoolFacets: z.array(marketMapRelationshipFacetSchema),
});

export type MarketMapPoint = z.infer<typeof marketMapPointSchema>;
export type MarketMapPointsResponse = z.infer<typeof marketMapPointsResponseSchema>;
export type MarketMapFacetsResponse = z.infer<typeof marketMapFacetsResponseSchema>;
