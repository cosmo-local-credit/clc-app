import { z } from "zod";

/** Publication controls apply to profile aggregation, not to public chain records. */
export const profileVisibilitySchema = z.object({
  enabled: z.boolean(),
  avatar: z.boolean(),
  name: z.boolean(),
  bio: z.boolean(),
  website: z.boolean(),
  email: z.boolean(),
  phone: z.boolean(),
  country: z.boolean(),
  locationName: z.boolean(),
  preciseLocation: z.boolean(),
  preferredCurrency: z.boolean(),
  vouchers: z.boolean(),
  offers: z.boolean(),
  wants: z.boolean(),
  pools: z.boolean(),
  posts: z.boolean(),
  catalogs: z.boolean(),
});

export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;

export const DEFAULT_PROFILE_VISIBILITY: Readonly<ProfileVisibility> = {
  enabled: true,
  avatar: true,
  name: false,
  bio: false,
  website: false,
  email: false,
  phone: false,
  country: false,
  locationName: false,
  preciseLocation: false,
  preferredCurrency: false,
  vouchers: true,
  offers: true,
  wants: true,
  pools: true,
  posts: false,
  catalogs: true,
};

export const PROFILE_SECTIONS = [
  "vouchers",
  "offers",
  "wants",
  "pools",
  "posts",
  "catalogs",
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const publicProfileIdentitySchema = z.object({
  address: addressSchema,
  username: z.string().nullish(),
  avatarUrl: z.string().url().nullish(),
});

export const publicProfileSchema = publicProfileIdentitySchema.extend({
  name: z.string().nullish(),
  bio: z.string().nullish(),
  website: z.string().nullish(),
  country: z.string().nullish(),
  preferredCurrency: z.string().nullish(),
  sections: z.object({
    vouchers: z.boolean(),
    offers: z.boolean(),
    wants: z.boolean(),
    pools: z.boolean(),
    posts: z.boolean(),
    catalogs: z.boolean(),
  }),
  hasPrivateDetails: z.boolean(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const publicProfileDetailsSchema = z.object({
  email: z.string().nullish(),
  phone: z.string().nullish(),
  locationName: z.string().nullish(),
  geoLat: z.number().finite().min(-90).max(90).nullish(),
  geoLng: z.number().finite().min(-180).max(180).nullish(),
});

export const profileResourceSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  kind: z.enum(["voucher", "offer", "want", "pool", "post", "catalog"]),
  resourceId: z.string(),
  name: z.string(),
  imageUrl: z.string().url().nullish(),
  description: z.string().nullish(),
  symbol: z.string().nullish(),
  management: z.enum(["direct", "multisig"]).nullish(),
});
export type ProfileResource = z.infer<typeof profileResourceSchema>;
