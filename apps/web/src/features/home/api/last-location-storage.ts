/**
 * Read-once bootstrap persistence for the last real GPS fix.
 *
 * Only a genuine `getCurrentPosition` success is ever written here — never a
 * MapTiler IP city, a Cloudflare country, or an environment default. Those are
 * approximations, and labelling a distance from one would be a lie.
 *
 * `capturedAt` is recorded but deliberately never expired: an old real fix is
 * a better camera bootstrap than a generic country centroid. When permission
 * is still granted the fix is refreshed in the background and overwritten.
 *
 * This is bootstrap state, not reactive cross-route state — it does not belong
 * in Zustand, and it must be read only after the client-only/effect boundary
 * so server and hydration renders start from the same camera.
 */
export type PersistedLocation = {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: string;
};

const STORAGE_KEY = "clc_last_location_v1";

export function readPersistedLocation(): PersistedLocation | null {
  const raw = getStorage()?.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPersistedLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writePersistedLocation(location: PersistedLocation): void {
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(location));
  } catch {
    // A full or blocked store must never break the camera.
  }
}

export function clearPersistedLocation(): void {
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the caller is already on a teardown path.
  }
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPersistedLocation(value: unknown): value is PersistedLocation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
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
