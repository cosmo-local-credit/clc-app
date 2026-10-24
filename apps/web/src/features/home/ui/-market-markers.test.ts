import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKER_COLORS,
  MARKER_COLOR_HEX,
  MARKER_ICONS,
  type MarkerColor,
  type MarkerIcon,
} from "@clc/core/features/markers/logic";
import { RiGroupFill } from "react-icons/ri";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installCanvasStub, installPath2DStub, type StubbedContext } from "./-market-canvas-stub";
import type { MarketLocation, MarketLocationKind } from "./market-data";
import {
  MARKET_NETWORK_BADGE_COLOR,
  MARKET_NETWORK_BADGE_IMAGE_ID,
  POOL_PIN_HEX,
  POOL_PIN_IMAGE_ID,
  SELECTED_PIN_SUFFIX,
  addMarketNetworkBadgeImage,
  addMarketMarkerImages,
  markerArt,
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

type VoucherKind = Exclude<MarketLocationKind, "pool" | "want">;

function automatic(kind: MarketLocationKind): MarkerSource {
  return { kind, markerIcon: null, markerColor: null };
}

describe("Want marker artwork", () => {
  it.each(["question", "message", "request"] as const)(
    "keeps the %s glyph distinct from voucher artwork",
    (markerIcon) => {
      const id = markerArt({ kind: "want", markerIcon, markerColor: "orange" }).image;
      expect(id).toBe(`market-pin-want-${markerIcon}-orange`);
      expect(id).not.toContain("voucher");
    },
  );

  it("registers every Want icon and safe colour with selected artwork", () => {
    const map = fakeMap();
    const icons = ["question", "message", "request"] as const;
    const wants = icons.flatMap((markerIcon) =>
      MARKER_COLORS.map((markerColor) => ({ kind: "want" as const, markerIcon, markerColor })),
    );

    addMarketMarkerImages(map as never, wants);

    for (const { markerIcon, markerColor } of wants) {
      const id = `market-pin-want-${markerIcon}-${markerColor}`;
      expect(map.images.has(id)).toBe(true);
      expect(map.images.has(`${id}-selected`)).toBe(true);
    }
  });
});

const KINDS: VoucherKind[] = ["goods", "services", "voucher"];
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
  const EXPECTED: Record<VoucherKind, [number, number, number]> = {
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

describe("market network badge", () => {
  it.each(["light", "dark"] as const)("draws a connected, opaque %s badge once", (theme) => {
    const map = fakeMap();

    addMarketNetworkBadgeImage(map as never, theme);
    addMarketNetworkBadgeImage(map as never, theme);

    expect([...map.images.keys()]).toEqual([MARKET_NETWORK_BADGE_IMAGE_ID[theme]]);
    const [record] = contexts.values();
    const [canvas] = contexts.keys();
    expect(record).toBeDefined();
    expect(canvas?.width).toBe(44);
    expect(canvas?.height).toBe(44);
    expect(record?.moves).toHaveLength(3);
    expect(record?.lines).toHaveLength(3);
    expect(record?.arcs).toHaveLength(8);
    expect(record?.fills).toContain(MARKET_NETWORK_BADGE_COLOR[theme].surface);
    expect(record?.fills).toContain(MARKET_NETWORK_BADGE_COLOR[theme].outline);
  });

  it("uses opposing surfaces in light and dark themes", () => {
    expect(MARKET_NETWORK_BADGE_COLOR.light.surface).not.toBe(
      MARKET_NETWORK_BADGE_COLOR.dark.surface,
    );
    expect(MARKET_NETWORK_BADGE_COLOR.light.ink).not.toBe(MARKET_NETWORK_BADGE_COLOR.dark.ink);
  });
});

/** The CSS Color 4 OKLCH to sRGB conversion, rounded to 8-bit channels. */
function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear
    .map((channel) => {
      const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

describe("pool marker", () => {
  const POOL = automatic("pool");

  it("draws one pin for every pool, plus its selected variant", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, [POOL, POOL, ...AUTOMATIC]);

    expect(map.images.has(POOL_PIN_IMAGE_ID)).toBe(true);
    expect(map.images.has(POOL_PIN_IMAGE_ID + SELECTED_PIN_SUFFIX)).toBe(true);
    expect(map.images.size).toBe(8);
  });

  it("draws a square, as wide as a voucher's disc, that points at its location", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, [POOL]);

    for (const [canvas, record] of contexts) {
      expect(record.arcs).toEqual([]);
      const [corner] = record.moves;
      const tip = record.lines.reduce((lowest, point) => (point.y > lowest.y ? point : lowest));
      if (!corner) throw new Error("expected the square's first corner");
      expect(corner.x).toBe(markerPin.padding);
      expect(tip.x).toBe(canvas.width / 2);
      expect(tip.y).toBe(canvas.height - markerPin.padding);
      expect(record.strokes).toContain("#ffffff");
    }
    expect(new Set([...contexts.keys()].map((canvas) => canvas.width))).toEqual(
      new Set([
        (markerPin.base.radius + markerPin.padding) * 2,
        (markerPin.selected.radius + markerPin.padding) * 2,
      ]),
    );
  });

  it("wears the Pools button's colour and glyph", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, [POOL]);

    const [r, g, b, a] = pixelOf(map.images.get(POOL_PIN_IMAGE_ID) as AddedImage);
    expect([r, g, b]).toEqual(rgbOf(POOL_PIN_HEX.pin));
    expect(a).toBe(255);
    const glyph = (RiGroupFill({}) as { props: { children: { props: { d: string } }[] } }).props
      .children;
    for (const record of contexts.values()) {
      expect(record.paths).toEqual(glyph.map((child) => child.props.d));
    }
  });

  it("matches the --info token the Pools button is filled with", () => {
    const css = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../styles.css"),
      "utf8",
    );
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const info = /--info:\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(root);
    if (!info) throw new Error("expected --info as oklch in :root");

    expect(POOL_PIN_HEX.pin).toBe(oklchToHex(Number(info[1]), Number(info[2]), Number(info[3])));
  });

  it("names a pool in a darker shade of its pin", () => {
    const sum = (hex: string) => rgbOf(hex).reduce((total, channel) => total + channel, 0);
    expect(sum(POOL_PIN_HEX.label)).toBeLessThan(sum(POOL_PIN_HEX.pin));
  });
});
