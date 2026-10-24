import { z } from "zod";
import { markerColorSchema, wantMarkerIconSchema, type WantMarkerIcon } from "../markers/logic";

export { wantMarkerIconSchema };
export type { WantMarkerIcon };

const wantStatusSchema = z.enum(["OPEN", "CLOSED"]);
const wantStateSchema = z.enum(["scheduled", "active", "expired", "closed"]);
export type WantState = z.infer<typeof wantStateSchema>;

const wantContactSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().min(1).optional(),
});
export type WantContact = z.infer<typeof wantContactSchema>;

const idSchema = z.union([z.string().min(1), z.number().int().positive()]).transform(String);

export const wantSchema = z.object({
  id: idSchema,
  ownerUserId: idSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  locationName: z.string().trim().min(1),
  geoLat: z.number().min(-90).max(90),
  geoLng: z.number().min(-180).max(180),
  startsAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  status: wantStatusSchema,
  state: wantStateSchema,
  tags: z.array(z.string()),
  imageUrl: z.string().url().nullable(),
  effectiveImageUrl: z.string().url().nullable(),
  markerIcon: wantMarkerIconSchema,
  markerColor: markerColorSchema,
  ownerName: z.string(),
  ownerUsername: z.string().nullable(),
  distanceMeters: z.number().nonnegative().nullable().optional(),
  contactPermission: z.number().int().min(0).max(3).optional(),
  contactText: z.string().trim().min(1).max(500).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  contact: wantContactSchema.optional(),
});
export type Want = z.infer<typeof wantSchema>;

export const wantWriteSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(2000),
    location: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      locationName: z.string().trim().min(1),
      country: z.string().trim().min(2).optional(),
    }),
    startsAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    imageUrl: z.string().url().nullable(),
    contactText: z.string().trim().max(500).nullable(),
    shareEmail: z.boolean(),
    sharePhone: z.boolean(),
    markerIcon: wantMarkerIconSchema,
    markerColor: markerColorSchema,
    tags: z.array(z.string().trim().min(1)).max(12),
  })
  .superRefine((value, context) => {
    if (!value.shareEmail && !value.sharePhone && !value.contactText?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["contactText"],
        message: "Choose email, phone, or enter contact instructions.",
      });
    }
    if (value.expiresAt && new Date(value.expiresAt) <= new Date(value.startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "The ending date must be after the start date.",
      });
    }
  });
export type WantWrite = z.infer<typeof wantWriteSchema>;

export function wantContactFrom(want: Want): WantContact | undefined {
  const contact = {
    ...(want.contactText ? { text: want.contactText } : {}),
    ...(want.email ? { email: want.email } : {}),
    ...(want.phone ? { phone: want.phone } : {}),
  };
  return Object.keys(contact).length ? contact : undefined;
}

export function defaultWantStartsAt(now = new Date()): string {
  return now.toISOString();
}

export function resolveWantState(
  want: Pick<Want, "status" | "startsAt" | "expiresAt">,
  now = new Date(),
): WantState {
  if (want.status === "CLOSED") return "closed";
  const at = now.getTime();
  if (new Date(want.startsAt).getTime() > at) return "scheduled";
  if (want.expiresAt && new Date(want.expiresAt).getTime() <= at) return "expired";
  return "active";
}
