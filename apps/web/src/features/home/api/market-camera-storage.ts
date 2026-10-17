/**
 * Where the market map last stood, so returning to it from a voucher, a pool
 * or a list finds the same view instead of re-centring on the profile.
 *
 * A pin opens its page and a badge its list by navigating away, which
 * unmounts the map. The camera has to outlive the route, and history state
 * cannot hold it: TanStack Router treats every write to an entry's state as
 * a navigation, and the camera changes on every pan. Session storage dies
 * with the tab, which is the lifetime a camera deserves.
 *
 * One slot, stamped with its owner, read back only by that owner and
 * cleared on sign-out: a view can show where someone was. The history index
 * tells Back to the same entry, which always restores, from a fresh visit to
 * the map, where a link to a voucher still wins.
 */
const STORAGE_KEY = "clc.market-camera.v1";

export type StoredMarketCamera = {
  owner: string;
  /** The history entry the map stood on. */
  index: number;
  lat: number;
  lng: number;
  zoom: number;
  /** The filter whose results the map had fitted, if any. */
  fitKey: string | null;
};

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readMarketCamera(owner: string): StoredMarketCamera | null {
  let value: unknown;
  try {
    const raw = sessionStore()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const camera = value as Partial<StoredMarketCamera>;
  const finite = (number: unknown): number is number =>
    typeof number === "number" && Number.isFinite(number);
  if (
    camera.owner !== owner ||
    !finite(camera.index) ||
    !finite(camera.lat) ||
    !finite(camera.lng) ||
    !finite(camera.zoom) ||
    Math.abs(camera.lat) > 90 ||
    Math.abs(camera.lng) > 180 ||
    (camera.fitKey !== null && typeof camera.fitKey !== "string")
  ) {
    return null;
  }
  return camera as StoredMarketCamera;
}

export function writeMarketCamera(camera: StoredMarketCamera): void {
  try {
    sessionStore()?.setItem(STORAGE_KEY, JSON.stringify(camera));
  } catch {
    // A full or blocked store only costs the restored view.
  }
}

export function clearMarketCamera(): void {
  try {
    sessionStore()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
