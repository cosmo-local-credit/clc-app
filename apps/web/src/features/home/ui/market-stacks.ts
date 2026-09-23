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
 * Half of the narrowest supported viewport (360 px), less a margin so the
 * outermost legs stay on screen once the stack is centred.
 */
const MAX_FAN_RADIUS = 168;

/**
 * Marker artwork is 24 px. A sunflower's nearest-neighbour distance is about
 * 1.77x the growth constant, so this spacing keeps legs ~29 px apart: tight
 * enough to fit a large fan, loose enough that icons never overlap.
 */
const LEG_SPACING = 26;
const MIN_RING_RADIUS = 34;
const RING_LIMIT = 8;
/** Golden angle: a sunflower spiral packs evenly at any count. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPIRAL_GROWTH = LEG_SPACING * 0.62;

/**
 * How many members one fan shows at a time.
 *
 * Derived from the radius budget rather than picked: the spiral grows as
 * sqrt(n), so this is the largest fan that still lands inside MAX_FAN_RADIUS.
 * It comfortably covers the 63-voucher Nairobi CBD stack in a single fan. The
 * three stacks above it (136, 162, 200) cannot fit on a phone at any spacing,
 * so those page rather than being truncated.
 */
export const SPIDER_PAGE_SIZE = Math.floor(
  ((MAX_FAN_RADIUS - MIN_RING_RADIUS) / SPIRAL_GROWTH) ** 2,
);

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
 * Small stacks get an even ring, which reads clearly as "these share a spot".
 * Larger ones get a sunflower spiral so the ring radius does not explode with
 * the member count.
 */
export function spiderfyOffsets(count: number): SpiderOffset[] {
  const legs = Math.min(count, SPIDER_PAGE_SIZE);
  if (legs < 1) return [];

  // A stack always has two or more members, but its *last page* can hold one
  // — a stack of SPIDER_PAGE_SIZE + 1, for instance. Returning nothing there
  // would render a blank fan the user cannot tell apart from a broken map.
  if (legs === 1) return [{ dx: 0, dy: -MIN_RING_RADIUS }];

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
    const radius = MIN_RING_RADIUS + SPIRAL_GROWTH * Math.sqrt(step);
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
