/**
 * Read-once bootstrap persistence for the last real GPS fix.
 *
 * Only a genuine `getCurrentPosition` success is ever written here — never a
 * MapTiler IP city, a Cloudflare country, or an environment default. Those are
 * approximations, and labelling a distance from one would be a lie.
 *
 * A precise location is sensitive, so it is bounded two ways:
 *
 * - **Scoped to an owner.** The signed-in address, or `GUEST_STORAGE_OWNER`. A
 *   different account — or a session that expired back to guest — never inherits
 *   the previous person's position, even though sign-out also clears it.
 *   Sign-out alone is not enough: a guest never signs out, and a session can
 *   lapse without one.
 * - **Expired after {@link MAX_PERSISTED_LOCATION_AGE_MS}.** Otherwise a
 *   guest's exact position would sit on a shared device indefinitely.
 *
 * This is bootstrap state, not reactive cross-route state — it does not belong
 * in Zustand, and it must be read only after the client-only/effect boundary
 * so server and hydration renders start from the same camera.
 *
 * Storage access goes through `lib/storage/local-storage.ts`, which four modules
 * had each reimplemented identically.
 */
import { readStorageItem, removeStorageItem, writeStorageItem } from "#/lib/storage/local-storage";

export type PersistedLocation = {
  /** Lowercased wallet address, or `"guest"` when nobody is signed in. */
  owner: string;
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
};

/**
 * How long a stored fix stays usable.
 *
 * A day keeps the realistic "I opened this yesterday" bootstrap working while
 * bounding how long a precise position can linger on a shared device. This
 * supersedes the original plan's "never expire" choice, which had no cleanup
 * path at all for visitors who never sign in.
 */
export const MAX_PERSISTED_LOCATION_AGE_MS = 24 * 60 * 60_000;

const STORAGE_KEY = "clc_last_location_v2";

export function readPersistedLocation(owner: string): PersistedLocation | null {
  const raw = readStorageItem(STORAGE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isPersistedLocation(parsed)) return null;

  const age = Date.now() - Date.parse(parsed.capturedAt);
  if (!(age < MAX_PERSISTED_LOCATION_AGE_MS)) {
    // Drop it rather than leaving a stale precise position on disk.
    clearPersistedLocation();
    return null;
  }

  return parsed.owner === owner ? parsed : null;
}

export function writePersistedLocation(location: PersistedLocation): void {
  // A full or blocked store must never break the camera; the write is best-effort.
  writeStorageItem(STORAGE_KEY, JSON.stringify(location));
}

export function clearPersistedLocation(): void {
  removeStorageItem(STORAGE_KEY);
}

function isPersistedLocation(value: unknown): value is PersistedLocation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.owner === "string" &&
    candidate.owner.length > 0 &&
    isCoordinate(candidate.lat, 90) &&
    isCoordinate(candidate.lng, 180) &&
    typeof candidate.accuracy === "number" &&
    Number.isFinite(candidate.accuracy) &&
    candidate.accuracy >= 0 &&
    typeof candidate.capturedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.capturedAt))
  );
}

function isCoordinate(value: unknown, bound: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -bound && value <= bound;
}
