import { MAP_MAX_ZOOM, type MarketLocation } from "./market-data";

/**
 * Vouchers whose markers cannot be told apart at any zoom.
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
 * A fanned pin's disc is 24 px. This remains the proximity threshold used to
 * decide whether pins can be distinguished at maximum zoom.
 */
const LEG_SPACING = 26;
/** Room for a 24 px pin, its outward label, and the 44 px centre badge. */
const LABELED_RING_RADIUS = 72;

/**
 * How many members one fan shows at a time.
 *
 * Eight positions fit around a readable ring on the narrowest supported phone.
 * Larger stacks page through the same positions so every member keeps both its
 * pin and its name instead of becoming an unlabeled field of icons.
 */
export const SPIDER_PAGE_SIZE = 8;

/**
 * How close two markers have to be, at MAP_MAX_ZOOM, to belong to one stack.
 *
 * Grouping on an exact coordinate is not enough. Two vouchers pinned at the
 * same place rarely land on the same number: in Kilifi North, WCHK sits 0.34 m
 * from the NJMN/NJMN2 pair — a difference in the seventh decimal of a degree,
 * and about five pixels at the deepest zoom the map allows. That left three
 * vouchers as two stacks, and the lone marker was drawn underneath the pair's
 * badge at every zoom, with the badge swallowing the tap as well: the voucher
 * was on the map and unreachable. Anything closer together than the spacing the
 * fan itself uses cannot be drawn as two markers — about two metres on the
 * ground — so it is fanned instead.
 */
const MERGE_DISTANCE_PX = LEG_SPACING;

/** MapLibre lays the world out on 512 px tiles, so this is its width at MAP_MAX_ZOOM. */
const MAX_ZOOM_WORLD_PX = 512 * 2 ** MAP_MAX_ZOOM;

/** Web Mercator has no value at the poles. MapLibre clamps here; so does this. */
const MERCATOR_MAX_LAT = 85.051129;

type ProjectedPoint = { x: number; y: number };

type AnchoredStack = { stack: MarketStack; point: ProjectedPoint };

export function groupByProximity(locations: MarketLocation[]): MarketStack[] {
  const stacks: MarketStack[] = [];
  // Grid cells exactly one merge distance wide, so a stack close enough to
  // absorb a point is always in that point's own cell or one of the eight
  // around it. Without this the pass is quadratic over a 4k-row catalog.
  const cells = new Map<string, AnchoredStack[]>();

  for (const location of locations) {
    const point = projectAtMaxZoom(location.lat, location.lng);
    const nearest = nearestStack(cells, point);
    if (nearest) {
      nearest.members.push(location);
      continue;
    }

    // The first member anchors the stack: its coordinate is where the badge
    // sits and what the open-fan key is compared against, and it stays put as
    // later pages of the catalog add members.
    const stack: MarketStack = {
      key: `${location.lat},${location.lng}`,
      lat: location.lat,
      lng: location.lng,
      members: [location],
    };
    stacks.push(stack);

    const key = cellKey(point.x, point.y);
    const cell = cells.get(key);
    if (cell) cell.push({ stack, point });
    else cells.set(key, [{ stack, point }]);
  }

  return stacks;
}

function nearestStack(
  cells: Map<string, AnchoredStack[]>,
  point: ProjectedPoint,
): MarketStack | null {
  let nearest: MarketStack | null = null;
  let shortest = MERGE_DISTANCE_PX;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const anchored of cells.get(
        cellKey(point.x + dx * MERGE_DISTANCE_PX, point.y + dy * MERGE_DISTANCE_PX),
      ) ?? []) {
        const distance = Math.hypot(anchored.point.x - point.x, anchored.point.y - point.y);
        if (distance < shortest) {
          nearest = anchored.stack;
          shortest = distance;
        }
      }
    }
  }

  return nearest;
}

/** Which grid cell a projected point falls in. */
function cellKey(x: number, y: number): string {
  return `${Math.floor(x / MERGE_DISTANCE_PX)},${Math.floor(y / MERGE_DISTANCE_PX)}`;
}

/**
 * Web Mercator pixel position at MAP_MAX_ZOOM — the same projection MapLibre
 * draws with, so the distances compared above are the distances on screen.
 * Degrees would not do: a degree of longitude is 111 km at the equator and
 * 56 km at 60 degrees north.
 */
function projectAtMaxZoom(lat: number, lng: number): ProjectedPoint {
  const sin = Math.sin(
    (Math.min(MERCATOR_MAX_LAT, Math.max(-MERCATOR_MAX_LAT, lat)) * Math.PI) / 180,
  );
  return {
    x: ((lng + 180) / 360) * MAX_ZOOM_WORLD_PX,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * MAX_ZOOM_WORLD_PX,
  };
}

/**
 * Pixel offsets from the shared anchor, one per visible member.
 *
 * Every page gets an even ring, which reads clearly as "these share a spot"
 * and gives each pin a stable outward direction for its label.
 */
export function spiderfyOffsets(count: number): SpiderOffset[] {
  const legs = Math.min(count, SPIDER_PAGE_SIZE);
  if (legs < 1) return [];

  // A stack always has two or more members, but its *last page* can hold one
  // — a stack of SPIDER_PAGE_SIZE + 1, for instance. Returning nothing there
  // would render a blank fan the user cannot tell apart from a broken map.
  if (legs === 1) return [{ dx: 0, dy: -LABELED_RING_RADIUS }];

  return Array.from({ length: legs }, (_, index) => {
    const angle = (index / legs) * 2 * Math.PI - Math.PI / 2;
    return {
      dx: LABELED_RING_RADIUS * Math.cos(angle),
      dy: LABELED_RING_RADIUS * Math.sin(angle),
    };
  });
}

export function spiderPageCount(memberCount: number): number {
  return Math.ceil(Math.max(0, memberCount) / SPIDER_PAGE_SIZE);
}

export function spiderPageMembers<T>(members: T[], page: number): T[] {
  if (page < 0) return [];
  return members.slice(page * SPIDER_PAGE_SIZE, (page + 1) * SPIDER_PAGE_SIZE);
}
