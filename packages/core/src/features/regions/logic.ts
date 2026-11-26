import { z } from "zod";

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ring = z
  .array(position)
  .min(4)
  .refine((points) => {
    const first = points[0]!;
    const last = points.at(-1)!;
    return first[0] === last[0] && first[1] === last[1];
  });
const polygon = z.array(ring).min(1);

// Only the server decides whether the geometry is valid and can be activated.
export const regionBoundarySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygon, crs: z.never().optional() }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(polygon).min(1),
    crs: z.never().optional(),
  }),
]);

const countryCode = z.string().regex(/^[A-Z]{3}$/);

export const regionCountrySchema = z.object({ code: countryCode, name: z.string().min(1) });
export const regionCountryBoundarySchema = regionCountrySchema.extend({
  boundary: regionBoundarySchema,
});

export const regionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  countryCode: countryCode.nullable(),
  active: z.boolean(),
  revision: z.number().int().positive(),
  boundary: regionBoundarySchema,
  poolApproval: z.boolean(),
  assignedAdmins: z.array(z.object({ address: z.string(), username: z.string().nullable() })),
});

export type RegionBoundary = z.infer<typeof regionBoundarySchema>;
export type Region = z.infer<typeof regionSchema>;
export type RegionInput = Pick<
  Region,
  "name" | "countryCode" | "active" | "boundary" | "poolApproval"
>;
