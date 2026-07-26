import type { MarketLocation } from "./market-data";

/**
 * Vouchers sharing one exact coordinate.
 *
 * 76% of the imported catalog sits on a coordinate shared with at least one
 * other voucher — whole towns and camps were geocoded to a single centroid,
 * with stacks as large as 200. Distance-based clustering cannot separate those
 * at any zoom, so they are grouped up front and fanned out on demand instead.
 */
export type MarketStack = {
  key: string;
  lat: number;
  lng: number;
  members: MarketLocation[];
};

export type SpiderOffset = { dx: number; dy: number };

/**
 * How many members one fan shows at a time.
 *
 * The spiral radius grows as sqrt(n), so this is a screen-space limit, not a
 * taste one: a full page lands inside ~146 px, which still fits a 360 px
 * viewport once the stack is centred. Larger stacks are paged rather than
 * truncated, so every member stays reachable.
 */
export const SPIDER_PAGE_SIZE = 36;

/** Marker artwork is 24 px, so legs are spaced to clear roughly one icon. */
const LEG_SPACING = 30;
const MIN_RING_RADIUS = 34;
const RING_LIMIT = 8;
/** Golden angle: a sunflower spiral packs evenly at any count. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function groupByCoordinate(locations: MarketLocation[]): MarketStack[] {
  const stacks = new Map<string, MarketStack>();

  for (const location of locations) {
    const key = coordinateKey(location.lat, location.lng);
    const existing = stacks.get(key);
    if (existing) {
      existing.members.push(location);
      continue;
    }
    stacks.set(key, { key, lat: location.lat, lng: location.lng, members: [location] });
  }

  return [...stacks.values()];
}

function coordinateKey(lat: number, lng: number): string {
  return `${lat},${lng}`;
}

/**
 * Pixel offsets from the shared anchor, one per visible member.
 *
 * Small stacks get an even ring, which reads clearly as "these share a spot".
 * Larger ones get a sunflower spiral so the ring radius does not explode with
 * the member count.
 */
export function spiderfyOffsets(count: number): SpiderOffset[] {
  const legs = Math.min(count, SPIDER_PAGE_SIZE);
  if (legs < 2) return [];

  if (legs <= RING_LIMIT) {
    // Radius that keeps neighbouring legs LEG_SPACING apart around the circle.
    const radius = Math.max(MIN_RING_RADIUS, LEG_SPACING / (2 * Math.sin(Math.PI / legs)));
    return Array.from({ length: legs }, (_, index) => {
      const angle = (index / legs) * 2 * Math.PI - Math.PI / 2;
      return { dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) };
    });
  }

  return Array.from({ length: legs }, (_, index) => {
    const step = index + 1;
    const radius = MIN_RING_RADIUS + LEG_SPACING * 0.62 * Math.sqrt(step);
    const angle = step * GOLDEN_ANGLE - Math.PI / 2;
    return { dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) };
  });
}

export function spiderPageCount(memberCount: number): number {
  return Math.ceil(Math.max(0, memberCount) / SPIDER_PAGE_SIZE);
}

export function spiderPageMembers<T>(members: T[], page: number): T[] {
  if (page < 0) return [];
  return members.slice(page * SPIDER_PAGE_SIZE, (page + 1) * SPIDER_PAGE_SIZE);
}
