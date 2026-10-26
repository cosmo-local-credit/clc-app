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

const marketMapMarkerSchema = z.object({
  type: z.literal("marker"),
  id: z.string().min(1),
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

const marketMapClusterSchema = z.object({
  type: z.literal("cluster"),
  id: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  count: z.number().int().positive(),
  kinds: z.object({
    voucher: z.number().int().nonnegative().optional(),
    want: z.number().int().nonnegative().optional(),
    pool: z.number().int().nonnegative().optional(),
    catalog: z.number().int().nonnegative().optional(),
    post: z.number().int().nonnegative().optional(),
  }),
  expansionZoom: z.number().min(0).max(22),
});

const marketMapFeatureSchema = z.discriminatedUnion("type", [
  marketMapMarkerSchema,
  marketMapClusterSchema,
]);

export const marketMapResponseSchema = z.object({
  features: z.array(marketMapFeatureSchema),
  tagFacets: z
    .array(z.object({ tag: z.string(), count: z.number().int().nonnegative() }))
    .optional(),
});

export type MarketMapMarker = z.infer<typeof marketMapMarkerSchema>;
export type MarketMapCluster = z.infer<typeof marketMapClusterSchema>;
export type MarketMapResponse = z.infer<typeof marketMapResponseSchema>;
