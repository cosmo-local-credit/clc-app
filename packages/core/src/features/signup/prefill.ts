import { isUnitOfAccount, normalizeUnitOfAccount, type UnitOfAccount } from "../../lib/currencies";
import { type LocationInput, locationSchema } from "../location/logic";

/**
 * The saved profile a create flow seeds itself from.
 *
 * Structural rather than `@clc/api`'s `ProfileResult` because core owns no
 * network types, and every field is optional because a backend older than
 * profile preferences omits them entirely.
 */
export type ProfileDefaults = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  bio?: string | null;
  preferredCurrency?: string | null;
  country?: string | null;
  locationName?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  avatarUrl?: string | null;
};

/**
 * What a voucher or pool form can start from once the person has a profile.
 *
 * Every field is a plain value the caller decides whether to apply: a create
 * flow only seeds a field the person has not touched, so this stays pure and
 * says nothing about form state.
 */
export type ProfilePrefill = {
  /** The person's profile name, suitable as the base for a new pool or voucher. */
  name: string;
  email: string;
  phone: string;
  website: string;
  /** The profile bio, which seeds a voucher's or pool's description. */
  description: string;
  location: LocationInput | undefined;
  /** `undefined` when the saved preference is not a unit this app offers. */
  unitOfAccount: UnitOfAccount | undefined;
  /** The profile avatar, which seeds a voucher icon or a pool logo. */
  imageUrl: string;
};

/**
 * Signup stores a placeholder address for a wallet created without an email.
 * It is not reachable, so it must never be published as a contact address.
 */
const PLACEHOLDER_EMAIL_SUFFIX = "@clc.local";

export function profilePrefill(profile: ProfileDefaults): ProfilePrefill {
  const email = profile.email?.trim() ?? "";
  // The profile stores the three location columns flat and the country
  // separately; only all four together make a location a form can hold, so a
  // profile saved before locations existed yields `undefined` rather than a
  // half-filled picker.
  const location = locationSchema.safeParse({
    lat: profile.geoLat,
    lng: profile.geoLng,
    locationName: profile.locationName,
    country: profile.country,
  });
  const preferredCurrency = profile.preferredCurrency?.trim().replace(/\s+/g, " ");

  return {
    name: profile.name?.trim() ?? "",
    email: email.endsWith(PLACEHOLDER_EMAIL_SUFFIX) ? "" : email,
    phone: profile.phone?.trim() ?? "",
    website: profile.website?.trim() ?? "",
    description: profile.bio?.trim() ?? "",
    location: location.success ? location.data : undefined,
    unitOfAccount: isUnitOfAccount(preferredCurrency)
      ? normalizeUnitOfAccount(preferredCurrency)
      : undefined,
    imageUrl: profile.avatarUrl?.trim() ?? "",
  };
}
