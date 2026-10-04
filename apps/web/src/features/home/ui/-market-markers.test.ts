import {
  MARKER_COLORS,
  MARKER_COLOR_HEX,
  MARKER_ICONS,
  type MarkerColor,
  type MarkerIcon,
} from "@clc/core/features/markers/logic";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installCanvasStub, installPath2DStub, type StubbedContext } from "./-market-canvas-stub";
import type { MarketLocation, MarketLocationKind } from "./market-data";
import {
  SELECTED_PIN_SUFFIX,
  addMarketMarkerImages,
  markerImageId,
  markerPin,
  resetMarketMarkerCache,
} from "./market-markers";

type AddedImage = {
  id: string;
  data: { data: Uint8ClampedArray };
  options: { pixelRatio: number };
};

type MarkerSource = Pick<MarketLocation, "kind" | "markerIcon" | "markerColor">;

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

function automatic(kind: MarketLocationKind): MarkerSource {
  return { kind, markerIcon: null, markerColor: null };
}

const KINDS: MarketLocationKind[] = ["goods", "services", "voucher"];
const AUTOMATIC = KINDS.map(automatic);

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
  it("keeps the ids of the pins every voucher drew before issuers could choose", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);

    expect([...map.images.keys()].sort()).toEqual(
      [
        "market-pin-basket-blue",
        "market-pin-basket-blue-selected",
        "market-pin-hand-coin-purple",
        "market-pin-hand-coin-purple-selected",
        "market-pin-coupon-orange",
        "market-pin-coupon-orange-selected",
      ].sort(),
    );
  });

  it("draws only the styles in use, once each however many vouchers share one", () => {
    const map = fakeMap();
    const chosen: MarkerSource = { kind: "goods", markerIcon: "health", markerColor: "pink" };

    addMarketMarkerImages(map as never, [chosen, chosen, automatic("goods"), chosen]);

    expect(map.images.size).toBe(4);
    expect(map.images.has("market-pin-health-pink")).toBe(true);
    expect(map.images.has(`market-pin-health-pink${SELECTED_PIN_SUFFIX}`)).toBe(true);
    expect(contexts.size).toBe(4);
  });

  it("does not re-register images that already exist", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);
    const before = contexts.size;
    addMarketMarkerImages(map as never, AUTOMATIC);

    expect(map.images.size).toBe(6);
    expect(contexts.size).toBe(before);
  });

  it("follows the kind for whichever half the issuer left unset", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, [
      { kind: "services", markerIcon: "food", markerColor: null },
      { kind: "voucher", markerIcon: null, markerColor: "cyan" },
    ]);

    expect(map.images.has("market-pin-food-purple")).toBe(true);
    expect(map.images.has("market-pin-coupon-cyan")).toBe(true);
  });

  it("draws every icon's glyph paths from the react-icons imports", () => {
    const map = fakeMap();

    addMarketMarkerImages(
      map as never,
      MARKER_ICONS.map((icon) => ({ kind: "voucher", markerIcon: icon, markerColor: "blue" })),
    );

    for (const record of contexts.values()) {
      expect(record.paths.length).toBeGreaterThanOrEqual(1);
      for (const definition of record.paths) {
        expect(definition.length).toBeGreaterThan(20);
        expect(definition.startsWith("M")).toBe(true);
      }
    }
    // Distinct artwork per icon, not one glyph drawn seven times.
    const glyphs = new Set([...contexts.values()].map((record) => record.paths.join("|")));
    expect(glyphs.size).toBe(MARKER_ICONS.length);
  });

  it("gives every marker a thin white stroke", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);

    for (const record of contexts.values()) {
      expect(record.strokes).toContain("#ffffff");
    }
  });

  it("scales the selected variant above its base", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);

    const canvases = [...contexts.keys()];
    const widths = new Set(canvases.map((canvas) => canvas.width));
    expect(widths).toEqual(
      new Set([
        (markerPin.base.radius + markerPin.padding) * 2,
        (markerPin.selected.radius + markerPin.padding) * 2,
      ]),
    );
  });

  it("draws a pin: a disc that tapers to a point below it", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);

    for (const [canvas, record] of contexts) {
      const [disc] = record.arcs;
      const [tip] = record.lines;
      if (!disc || !tip) throw new Error("expected a disc and a tip");
      expect(tip.x).toBe(disc.x);
      expect(tip.y).toBeGreaterThan(disc.y + disc.radius);
      // The tip sits on the bottom of the artwork, inside the shadow margin.
      expect(tip.y).toBe(canvas.height - markerPin.padding);
      expect(canvas.height).toBeGreaterThan(canvas.width);
    }
  });
});

function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const sector =
    max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}

function paintedImage(map: ReturnType<typeof fakeMap>, icon: MarkerIcon, color: MarkerColor) {
  const image = map.images.get(markerImageId({ icon, color }));
  if (!image) throw new Error(`missing image for ${icon} ${color}`);
  return image;
}

describe("market marker colours", () => {
  // Goods is blue, services is purple, and a voucher with no offerings is
  // orange. None of these may follow the brand primary: that colour belongs
  // to the live-location pin, and it changes between prod and staging.
  const EXPECTED: Record<MarketLocationKind, [number, number, number]> = {
    goods: rgbOf("#2563eb"),
    services: rgbOf("#7c3aed"),
    voucher: rgbOf("#ea580c"),
  };

  it("paints each kind's automatic pin in the colour it always had", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);

    const pins = { goods: "basket", services: "hand-coin", voucher: "coupon" } as const;
    const colors = { goods: "blue", services: "purple", voucher: "orange" } as const;
    for (const kind of KINDS) {
      const [r, g, b, a] = pixelOf(paintedImage(map, pins[kind], colors[kind]));
      expect([r, g, b]).toEqual(EXPECTED[kind]);
      expect(a).toBe(255);
    }
  });

  it("paints every palette colour distinctly, and none of them red or green", () => {
    const map = fakeMap();

    addMarketMarkerImages(
      map as never,
      MARKER_COLORS.map((color) => ({ kind: "voucher", markerIcon: "coupon", markerColor: color })),
    );

    const painted = MARKER_COLORS.map((color) => {
      const [r, g, b, a] = pixelOf(paintedImage(map, "coupon", color));
      expect([r, g, b]).toEqual(rgbOf(MARKER_COLOR_HEX[color].pin));
      expect(a).toBe(255);
      // Red and green are the staging and prod live-location pins.
      const hue = hueOf(r, g, b);
      expect(hue > 15 && hue < 345).toBe(true);
      expect(hue >= 90 && hue <= 170).toBe(false);
      return [r, g, b].join(",");
    });
    expect(new Set(painted).size).toBe(MARKER_COLORS.length);
  });

  it("names each pin in a darker shade of its colour", () => {
    for (const color of MARKER_COLORS) {
      const pin = rgbOf(MARKER_COLOR_HEX[color].pin).reduce((sum, channel) => sum + channel, 0);
      const label = rgbOf(MARKER_COLOR_HEX[color].label).reduce((sum, channel) => sum + channel, 0);
      expect(label).toBeLessThan(pin);
    }
  });

  it("ignores the brand token even when Canvas can parse oklch", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "oklch(0.72 0.13 178)",
    } as unknown as CSSStyleDeclaration);
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);

    expect(pixelOf(paintedImage(map, "basket", "blue")).slice(0, 3)).toEqual(EXPECTED.goods);
    const fills = [...contexts.values()].flatMap((record) => record.fills);
    expect(fills).not.toContain("oklch(0.72 0.13 178)");
  });
});
