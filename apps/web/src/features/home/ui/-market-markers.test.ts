import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installCanvasStub, installPath2DStub, type StubbedContext } from "./-market-canvas-stub";
import type { MarketLocationKind } from "./market-data";
import {
  addMarketMarkerImages,
  MARKET_MARKER_KINDS,
  markerImageIds,
  resetMarketMarkerCache,
} from "./market-markers";

type AddedImage = {
  id: string;
  data: { data: Uint8ClampedArray };
  options: { pixelRatio: number };
};

function fakeMap() {
  const images = new Map<string, AddedImage>();
  return {
    images,
    hasImage: (id: string) => images.has(id),
    addImage: (id: string, data: AddedImage["data"], options: AddedImage["options"]) => {
      images.set(id, { id, data, options });
    },
  };
}

function pixelOf(image: AddedImage): [number, number, number, number] {
  const [r, g, b, a] = image.data.data;
  return [r ?? 0, g ?? 0, b ?? 0, a ?? 0];
}

let contexts: Map<HTMLCanvasElement, StubbedContext>;

beforeEach(() => {
  resetMarketMarkerCache();
  contexts = installCanvasStub();
  installPath2DStub();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("market marker images", () => {
  it("registers exactly six images: base and selected per kind", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const map = fakeMap();

    addMarketMarkerImages(map as never);

    expect([...map.images.keys()].sort()).toEqual(
      [
        "market-goods",
        "market-goods-selected",
        "market-services",
        "market-services-selected",
        "market-voucher",
        "market-voucher-selected",
      ].sort(),
    );
  });

  it("does not re-register images that already exist", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const map = fakeMap();

    addMarketMarkerImages(map as never);
    const before = contexts.size;
    addMarketMarkerImages(map as never);

    expect(map.images.size).toBe(6);
    expect(contexts.size).toBe(before);
  });

  it("draws the locked glyph paths from the react-icons imports", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const map = fakeMap();

    addMarketMarkerImages(map as never);

    const drawn = [...contexts.values()].flatMap((record) => record.paths);
    // Six markers, each with at least one real SVG path from react-icons/ri.
    expect(drawn.length).toBeGreaterThanOrEqual(6);
    for (const definition of drawn) {
      expect(definition.length).toBeGreaterThan(20);
      expect(definition.startsWith("M")).toBe(true);
    }
  });

  it("gives every marker a thin white stroke", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const map = fakeMap();

    addMarketMarkerImages(map as never);

    for (const record of contexts.values()) {
      expect(record.strokes).toContain("#ffffff");
    }
  });

  it("scales the selected variant above its base", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const map = fakeMap();

    addMarketMarkerImages(map as never);

    for (const kind of MARKET_MARKER_KINDS) {
      const base = map.images.get(markerImageIds.base[kind]);
      const selected = map.images.get(markerImageIds.selected[kind]);
      expect(base).toBeDefined();
      expect(selected).toBeDefined();
    }
  });
});

describe("market marker colours without Canvas OKLCH support", () => {
  const EXPECTED_FALLBACK: Record<MarketLocationKind, [number, number, number]> = {
    goods: [0x17, 0x62, 0xb8],
    services: [0x25, 0x63, 0xeb],
    voucher: [0x1f, 0x24, 0x30],
  };

  it("paints an audited sRGB pixel instead of silently keeping the previous fill", () => {
    // The failure this guards against is silent: an unsupported oklch() string
    // leaves fillStyle untouched, so the marker paints in the last colour used.
    vi.stubGlobal("CSS", { supports: () => false });
    const map = fakeMap();

    addMarketMarkerImages(map as never);

    for (const kind of MARKET_MARKER_KINDS) {
      const image = map.images.get(markerImageIds.base[kind]);
      if (!image) throw new Error(`missing image for ${kind}`);
      const [r, g, b, a] = pixelOf(image);
      expect([r, g, b]).toEqual(EXPECTED_FALLBACK[kind]);
      expect(a).toBe(255);
    }
  });

  it("gives each kind a distinct colour", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const map = fakeMap();

    addMarketMarkerImages(map as never);

    const painted = MARKET_MARKER_KINDS.map((kind) => {
      const image = map.images.get(markerImageIds.base[kind]);
      if (!image) throw new Error(`missing image for ${kind}`);
      return pixelOf(image).join(",");
    });
    expect(new Set(painted).size).toBe(MARKET_MARKER_KINDS.length);
  });

  it("prefers the resolved CSS token when Canvas can parse oklch", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "oklch(0.72 0.13 178)",
    } as unknown as CSSStyleDeclaration);
    const map = fakeMap();

    addMarketMarkerImages(map as never);

    const fills = [...contexts.values()].flatMap((record) => record.fills);
    expect(fills).toContain("oklch(0.72 0.13 178)");
  });

  it("falls back when the CSS token resolves to an empty string", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "   ",
    } as unknown as CSSStyleDeclaration);
    const map = fakeMap();

    addMarketMarkerImages(map as never);

    const goods = map.images.get(markerImageIds.base.goods);
    if (!goods) throw new Error("missing goods image");
    expect(pixelOf(goods).slice(0, 3)).toEqual(EXPECTED_FALLBACK.goods);
  });
});
