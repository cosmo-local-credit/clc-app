import { describe, expect, it } from "vite-plus/test";

import type { MarketLocation } from "./market-data";
import {
  SPIDER_PAGE_SIZE,
  groupByProximity,
  spiderPageCount,
  spiderPageMembers,
  spiderfyOffsets,
} from "./market-stacks";

function at(id: string, lat: number, lng: number): MarketLocation {
  return {
    id,
    name: `Voucher ${id}`,
    kind: "voucher",
    markerIcon: null,
    markerColor: null,
    lat,
    lng,
    locationName: null,
  };
}

describe("groupByProximity", () => {
  it("returns one single-member stack per distinct location", () => {
    const stacks = groupByProximity([at("1", -1.28, 36.82), at("2", -1.3, 36.81)]);

    expect(stacks).toHaveLength(2);
    expect(stacks.every((stack) => stack.members.length === 1)).toBe(true);
  });

  it("collapses vouchers on one exact coordinate into a single stack", () => {
    // 63 vouchers share -1.283253,36.817245 in the real catalog.
    const stacks = groupByProximity([
      at("1", -1.283253, 36.817245),
      at("2", -1.283253, 36.817245),
      at("3", -1.283253, 36.817245),
    ]);

    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.members.map((member) => member.id)).toEqual(["1", "2", "3"]);
    expect(stacks[0]?.lat).toBe(-1.283253);
    expect(stacks[0]?.lng).toBe(-0 + 36.817245);
  });

  it("keeps near-but-distinct coordinates apart", () => {
    // ~150 m apart in the real Kilifi North data; separable by zooming.
    const stacks = groupByProximity([
      at("1", -3.6789944, 39.8335828),
      at("2", -3.6789434, 39.8349467),
    ]);

    expect(stacks).toHaveLength(2);
  });

  it("stacks vouchers pinned a fraction of a metre apart", () => {
    // The real Kilifi North trio. NJMN and NJMN2 share a coordinate exactly;
    // WCHK is 0.34 m away, which is under five pixels at MAP_MAX_ZOOM. Grouped
    // on the exact coordinate it became a second stack and was drawn — and
    // tapped — underneath the pair's badge, so it never appeared on the map.
    const stacks = groupByProximity([
      at("WCHK", -3.6844169, 39.8327649),
      at("NJMN2", -3.684415, 39.8327673),
      at("NJMN", -3.684415, 39.8327673),
    ]);

    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.members.map((member) => member.id)).toEqual(["WCHK", "NJMN2", "NJMN"]);
  });

  it("keeps vouchers a marker's width apart in separate stacks", () => {
    // 10 m north: two clear markers once the map is zoomed in.
    const stacks = groupByProximity([
      at("1", -3.684415, 39.8327673),
      at("2", -3.6843252, 39.8327673),
    ]);

    expect(stacks).toHaveLength(2);
  });

  it("still groups at the poles, where Mercator has no value", () => {
    const stacks = groupByProximity([at("1", 90, 0), at("2", 90, 0), at("3", -90, 0)]);

    expect(stacks.map((stack) => stack.members.length)).toEqual([2, 1]);
  });

  it("preserves input order of both stacks and members", () => {
    const stacks = groupByProximity([at("a", 1, 1), at("b", 2, 2), at("c", 1, 1), at("d", 2, 2)]);

    expect(stacks.map((stack) => stack.members.map((member) => member.id))).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
  });

  it("gives every stack a stable key derived from its coordinate", () => {
    const first = groupByProximity([at("1", -1.283253, 36.817245)]);
    const second = groupByProximity([at("2", -1.283253, 36.817245)]);

    expect(first[0]?.key).toBe(second[0]?.key);
  });

  it("does not confuse a swapped latitude and longitude", () => {
    const stacks = groupByProximity([at("1", 10, 20), at("2", 20, 10)]);

    expect(stacks).toHaveLength(2);
  });

  it("handles an empty catalog", () => {
    expect(groupByProximity([])).toEqual([]);
  });
});

describe("spiderfyOffsets", () => {
  it("returns nothing for an empty page", () => {
    expect(spiderfyOffsets(0)).toEqual([]);
  });

  it("still places a lone member, so a trailing page is never blank", () => {
    // A stack of SPIDER_PAGE_SIZE + 1 has a final page of exactly one member.
    // Returning no offsets there renders an empty fan the user cannot escape.
    const offsets = spiderfyOffsets(1);
    expect(offsets).toHaveLength(1);
    expect(Math.hypot(offsets[0]?.dx ?? 0, offsets[0]?.dy ?? 0)).toBeGreaterThan(0);
  });

  it("lays small stacks out as an evenly spaced ring", () => {
    const offsets = spiderfyOffsets(6);

    expect(offsets).toHaveLength(6);
    const radii = offsets.map((offset) => Math.hypot(offset.dx, offset.dy));
    for (const radius of radii) {
      expect(radius).toBeCloseTo(radii[0] ?? 0, 6);
    }
  });

  it("uses a label-friendly page of eight pins", () => {
    expect(SPIDER_PAGE_SIZE).toBe(8);
    expect(spiderfyOffsets(20)).toHaveLength(8);
  });

  it("keeps ring neighbours far enough apart not to overlap", () => {
    for (const count of [2, 3, 5, 8]) {
      const offsets = spiderfyOffsets(count);
      for (let i = 1; i < offsets.length; i++) {
        const previous = offsets[i - 1];
        const current = offsets[i];
        if (!previous || !current) throw new Error("missing offset");
        const gap = Math.hypot(current.dx - previous.dx, current.dy - previous.dy);
        // Markers are 24 px, so neighbours must clear roughly one icon.
        expect(gap).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("expands the ring far enough to leave room for outward labels", () => {
    const offsets = spiderfyOffsets(SPIDER_PAGE_SIZE);
    const radii = offsets.map((offset) => Math.hypot(offset.dx, offset.dy));

    expect(Math.min(...radii)).toBeGreaterThanOrEqual(70);
    expect(Math.max(...radii)).toBeLessThan(90);
  });

  it("never places two members on the same spot", () => {
    for (const count of [2, 7, 13, 30, SPIDER_PAGE_SIZE]) {
      const offsets = spiderfyOffsets(count);
      const seen = new Set(
        offsets.map((offset) => `${offset.dx.toFixed(2)},${offset.dy.toFixed(2)}`),
      );
      expect(seen.size).toBe(offsets.length);
    }
  });

  it("never places a member on the anchor point", () => {
    for (const offset of spiderfyOffsets(30)) {
      expect(Math.hypot(offset.dx, offset.dy)).toBeGreaterThan(0);
    }
  });

  it("never lays out more than one page of legs", () => {
    expect(spiderfyOffsets(200)).toHaveLength(SPIDER_PAGE_SIZE);
    expect(spiderfyOffsets(SPIDER_PAGE_SIZE + 40)).toHaveLength(SPIDER_PAGE_SIZE);
  });

  it("keeps a full page inside a phone-sized fan radius", () => {
    const radii = spiderfyOffsets(SPIDER_PAGE_SIZE).map((o) => Math.hypot(o.dx, o.dy));
    // Half of a 360 px screen, less a small margin: the fan must not run off
    // the edge once the stack is centred.
    expect(Math.max(...radii)).toBeLessThan(170);
  });

  it("limits a 63-stack to one readable page", () => {
    const radii = spiderfyOffsets(63).map((o) => Math.hypot(o.dx, o.dy));
    expect(radii).toHaveLength(SPIDER_PAGE_SIZE);
    expect(Math.max(...radii)).toBeLessThan(170);
  });

  it("never lets neighbouring legs overlap a 24 px icon", () => {
    const offsets = spiderfyOffsets(SPIDER_PAGE_SIZE);
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        const a = offsets[i];
        const b = offsets[j];
        if (!a || !b) continue;
        closest = Math.min(closest, Math.hypot(a.dx - b.dx, a.dy - b.dy));
      }
    }
    expect(closest).toBeGreaterThanOrEqual(24);
  });

  it("is deterministic", () => {
    expect(spiderfyOffsets(17)).toEqual(spiderfyOffsets(17));
  });
});

describe("spider paging", () => {
  const members = Array.from({ length: 63 }, (_, index) => at(String(index), 1, 1));

  it("treats a stack that fits as a single page", () => {
    expect(spiderPageCount(3)).toBe(1);
    expect(spiderPageCount(SPIDER_PAGE_SIZE)).toBe(1);
  });

  it("splits a stack larger than one page", () => {
    expect(spiderPageCount(SPIDER_PAGE_SIZE + 1)).toBe(2);
    expect(spiderPageCount(200)).toBe(Math.ceil(200 / SPIDER_PAGE_SIZE));
  });

  it("pages the 63-voucher Nairobi CBD stack without dropping labels", () => {
    expect(spiderPageCount(63)).toBe(8);
    expect(spiderPageMembers(members, 0)).toHaveLength(SPIDER_PAGE_SIZE);
    expect(spiderPageMembers(members, 7)).toHaveLength(7);
  });

  it("has no pages for an empty stack", () => {
    expect(spiderPageCount(0)).toBe(0);
  });

  it("returns a full first page and the remainder on the second", () => {
    const huge = Array.from({ length: SPIDER_PAGE_SIZE + 4 }, (_, i) => at(String(i), 2, 2));
    expect(spiderPageMembers(huge, 0)).toHaveLength(SPIDER_PAGE_SIZE);
    expect(spiderPageMembers(huge, 1)).toHaveLength(4);
  });

  it("covers every member exactly once across all pages", () => {
    const seen = [];
    for (let page = 0; page < spiderPageCount(members.length); page++) {
      seen.push(...spiderPageMembers(members, page));
    }
    expect(seen).toHaveLength(members.length);
    expect(new Set(seen.map((m) => m.id)).size).toBe(members.length);
  });

  it("returns nothing beyond the last page", () => {
    expect(spiderPageMembers(members, spiderPageCount(members.length))).toEqual([]);
    expect(spiderPageMembers(members, -1)).toEqual([]);
  });
});
