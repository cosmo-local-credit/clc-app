import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKER_COLORS,
  MARKER_ICONS,
  RESOURCE_COLOR_HEX,
  type MarkerIcon,
} from "@clc/core/features/markers/logic";
import { RiGroupFill } from "react-icons/ri";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installCanvasStub, installPath2DStub, type StubbedContext } from "./-market-canvas-stub";
import type { MarketLocation, MarketLocationKind } from "./market-data";
import {
  MARKET_NETWORK_BADGE_COLOR,
  MARKET_NETWORK_BADGE_IMAGE_ID,
  CATALOG_PIN_HEX,
  CATALOG_PIN_IMAGE_ID,
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

type VoucherKind = Exclude<MarketLocationKind, "pool" | "want" | "catalog" | "post">;

function automatic(kind: MarketLocationKind): MarkerSource {
  return { kind, markerIcon: null, markerColor: null };
}

describe("Want marker artwork", () => {
  it.each(["question", "message", "request"] as const)(
    "keeps the %s glyph distinct from voucher artwork",
    (markerIcon) => {
      const id = markerArt({ kind: "want", markerIcon, markerColor: "orange" }).image;
      expect(id).toBe(`market-pin-want-${markerIcon}`);
      expect(id).not.toContain("voucher");
    },
  );

  it("registers one orange image per Want icon regardless of legacy colour", () => {
    const map = fakeMap();
    const icons = ["question", "message", "request"] as const;
    const wants = icons.flatMap((markerIcon) =>
      MARKER_COLORS.map((markerColor) => ({ kind: "want" as const, markerIcon, markerColor })),
    );

    addMarketMarkerImages(map as never, wants);

    for (const { markerIcon } of wants) {
      const id = `market-pin-want-${markerIcon}`;
      expect(map.images.has(id)).toBe(true);
      expect(map.images.has(`${id}-selected`)).toBe(true);
    }
    expect(map.images.size).toBe(icons.length * 2);
  });
});

describe("Catalog and Post marker artwork", () => {
  it("gives Catalogs a fixed purple book pin and selected variant", () => {
    const map = fakeMap();
    addMarketMarkerImages(map as never, [automatic("catalog")]);

    expect(markerArt(automatic("catalog"))).toMatchObject({
      image: CATALOG_PIN_IMAGE_ID,
      fill: CATALOG_PIN_HEX.pin,
      body: "square",
    });
    expect(map.images.has(CATALOG_PIN_IMAGE_ID)).toBe(true);
    expect(map.images.has(CATALOG_PIN_IMAGE_ID + SELECTED_PIN_SUFFIX)).toBe(true);
  });

  it.each(["post", "event", "announcement"] as const)(
    "draws the %s Post style in fixed gray",
    (markerIcon) => {
      const source = { kind: "post" as const, markerIcon, markerColor: "cyan" as const };
      const map = fakeMap();
      addMarketMarkerImages(map as never, [source]);

      const id = `market-pin-post-${markerIcon}`;
      expect(markerArt(source)).toMatchObject({ image: id, fill: RESOURCE_COLOR_HEX.post.pin });
      expect(map.images.has(id)).toBe(true);
      expect(map.images.has(id + SELECTED_PIN_SUFFIX)).toBe(true);
    },
  );

  it("uses the Post glyph and fixed gray for legacy map rows", () => {
    expect(markerArt(automatic("post"))).toMatchObject({
      image: "market-pin-post-post",
      fill: RESOURCE_COLOR_HEX.post.pin,
    });
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
        "market-pin-voucher-basket",
        "market-pin-voucher-basket-selected",
        "market-pin-voucher-hand-coin",
        "market-pin-voucher-hand-coin-selected",
        "market-pin-voucher-coupon",
        "market-pin-voucher-coupon-selected",
      ].sort(),
    );
  });

  it("draws only the styles in use, once each however many vouchers share one", () => {
    const map = fakeMap();
    const chosen: MarkerSource = { kind: "goods", markerIcon: "health", markerColor: "pink" };

    addMarketMarkerImages(map as never, [chosen, chosen, automatic("goods"), chosen]);

    expect(map.images.size).toBe(4);
    expect(map.images.has("market-pin-voucher-health")).toBe(true);
    expect(map.images.has(`market-pin-voucher-health${SELECTED_PIN_SUFFIX}`)).toBe(true);
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

    expect(map.images.has("market-pin-voucher-food")).toBe(true);
    expect(map.images.has("market-pin-voucher-coupon")).toBe(true);
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

function paintedImage(map: ReturnType<typeof fakeMap>, icon: MarkerIcon) {
  const image = map.images.get(markerImageId({ icon }));
  if (!image) throw new Error(`missing image for ${icon}`);
  return image;
}

describe("market marker colours", () => {
  const EXPECTED = rgbOf(RESOURCE_COLOR_HEX.voucher.pin);

  it("paints every voucher-derived kind green", () => {
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);

    const pins = { goods: "basket", services: "hand-coin", voucher: "coupon" } as const;
    for (const kind of KINDS) {
      const [r, g, b, a] = pixelOf(paintedImage(map, pins[kind]));
      expect([r, g, b]).toEqual(EXPECTED);
      expect(a).toBe(255);
    }
  });

  it("ignores every legacy custom colour", () => {
    const map = fakeMap();

    addMarketMarkerImages(
      map as never,
      MARKER_COLORS.map((color) => ({ kind: "voucher", markerIcon: "coupon", markerColor: color })),
    );

    const [r, g, b, a] = pixelOf(paintedImage(map, "coupon"));
    expect([r, g, b]).toEqual(EXPECTED);
    expect(a).toBe(255);
    expect(map.images.size).toBe(2);
  });

  it("names vouchers in the fixed darker green", () => {
    const pin = rgbOf(RESOURCE_COLOR_HEX.voucher.pin).reduce((sum, channel) => sum + channel, 0);
    const label = rgbOf(RESOURCE_COLOR_HEX.voucher.label).reduce(
      (sum, channel) => sum + channel,
      0,
    );
    expect(label).toBeLessThan(pin);
  });

  it("ignores the brand token even when Canvas can parse oklch", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "oklch(0.72 0.13 178)",
    } as unknown as CSSStyleDeclaration);
    const map = fakeMap();

    addMarketMarkerImages(map as never, AUTOMATIC);

    expect(pixelOf(paintedImage(map, "basket")).slice(0, 3)).toEqual(EXPECTED);
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

  it("matches the fixed --pool resource token", () => {
    const css = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../styles.css"),
      "utf8",
    );
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const pool = /--pool:\s*(#[\da-f]{6})/.exec(root)?.[1];
    expect(pool).toBe(POOL_PIN_HEX.pin.toLowerCase());
  });

  it("names a pool in a darker shade of its pin", () => {
    const sum = (hex: string) => rgbOf(hex).reduce((total, channel) => total + channel, 0);
    expect(sum(POOL_PIN_HEX.label)).toBeLessThan(sum(POOL_PIN_HEX.pin));
  });
});
