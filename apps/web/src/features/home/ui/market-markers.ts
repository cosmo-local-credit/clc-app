import type MapLibreGL from "maplibre-gl";
import type { IconType } from "react-icons";
import { RiCouponFill, RiHandCoinFill, RiShoppingBasket2Fill } from "react-icons/ri";

import type { MarketLocationKind } from "./market-data";

/**
 * Exactly six voucher marker images: a base and a selected variant per kind.
 * Cluster circles and counts are style layers, not images.
 */
export const markerImageIds = {
  base: {
    goods: "market-goods",
    services: "market-services",
    voucher: "market-voucher",
  },
  selected: {
    goods: "market-goods-selected",
    services: "market-services-selected",
    voucher: "market-voucher-selected",
  },
} as const;

export const MARKET_MARKER_KINDS: MarketLocationKind[] = ["goods", "services", "voucher"];

type PinShape = { radius: number; tail: number };

/**
 * A Google Maps place pin: a disc that tapers to a short point at the
 * location it marks. 26 px across, 34 px when selected. Logical pixels.
 */
export const markerPin = {
  base: { radius: 13, tail: 6 },
  selected: { radius: 17, tail: 8 },
  /** Room around the artwork for the white stroke and the drop shadow. */
  padding: 3,
} as const satisfies { base: PinShape; selected: PinShape; padding: number };

const GLYPH_FRACTION = 0.58;
const ICON_VIEWBOX = 24;
const STROKE_WIDTH = 1.5;
const SHADOW = { color: "rgba(0, 0, 0, 0.3)", blur: 2, offsetY: 1 };

/**
 * Fixed sRGB fills, one per offering kind, with a darker shade of each for the
 * name beside the pin, the way Google Maps colours a place's label.
 *
 * Goods is blue, services is purple, and a voucher with no offerings is orange.
 * These stay off `--primary`: the live-location pin owns the brand colour
 * (green on prod, red on staging), and an oklch token painted onto a canvas
 * is silently ignored by older implementations. Hex is the colour the marker
 * actually draws.
 */
const KIND_COLOR: Record<MarketLocationKind, string> = {
  goods: "#2563eb",
  services: "#7c3aed",
  voucher: "#ea580c",
};

export const KIND_LABEL_COLOR: Record<MarketLocationKind, string> = {
  goods: "#1d4ed8",
  services: "#6d28d9",
  voucher: "#c2410c",
};

const kindIcon: Record<MarketLocationKind, IconType> = {
  goods: RiShoppingBasket2Fill,
  services: RiHandCoinFill,
  voucher: RiCouponFill,
};

let iconPathCache: Partial<Record<MarketLocationKind, string[]>> = {};

export function resetMarketMarkerCache(): void {
  iconPathCache = {};
}

export function addMarketMarkerImages(map: MapLibreGL.Map): void {
  for (const kind of MARKET_MARKER_KINDS) {
    addImage(map, markerImageIds.base[kind], kind, markerPin.base);
    addImage(map, markerImageIds.selected[kind], kind, markerPin.selected);
  }
}

function addImage(
  map: MapLibreGL.Map,
  imageId: string,
  kind: MarketLocationKind,
  shape: PinShape,
): void {
  if (map.hasImage(imageId)) return;
  const image = createMarkerImage(kind, shape);
  if (!image) return;
  map.addImage(imageId, image.data, { pixelRatio: image.pixelRatio });
}

function createMarkerImage(
  kind: MarketLocationKind,
  { radius, tail }: PinShape,
): { data: ImageData; pixelRatio: number } | null {
  const { padding } = markerPin;
  const width = radius * 2 + padding * 2;
  const height = radius * 2 + tail + padding * 2;
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(pixelRatio, pixelRatio);
  ctx.clearRect(0, 0, width, height);

  const center = { x: width / 2, y: padding + radius };
  // The two straight edges are tangents from the tip, so they meet the disc
  // without a kink.
  const spread = Math.acos(radius / (radius + tail));

  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, Math.PI / 2 + spread, Math.PI / 2 - spread);
  ctx.lineTo(center.x, center.y + radius + tail);
  ctx.closePath();

  // Shadow geometry ignores the context transform, so it is scaled by hand.
  ctx.shadowColor = SHADOW.color;
  ctx.shadowBlur = SHADOW.blur * pixelRatio;
  ctx.shadowOffsetY = SHADOW.offsetY * pixelRatio;
  ctx.fillStyle = KIND_COLOR[kind];
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineJoin = "round";
  ctx.stroke();

  drawKindGlyph(ctx, kind, center, radius * 2 * GLYPH_FRACTION);

  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio };
}

function drawKindGlyph(
  ctx: CanvasRenderingContext2D,
  kind: MarketLocationKind,
  center: { x: number; y: number },
  glyphSize: number,
): void {
  // jsdom and very old WebViews lack Path2D; the coloured pin still renders.
  if (typeof Path2D === "undefined") return;

  const scale = glyphSize / ICON_VIEWBOX;
  ctx.save();
  ctx.translate(center.x - glyphSize / 2, center.y - glyphSize / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  for (const definition of iconPaths(kind)) {
    ctx.fill(new Path2D(definition));
  }
  ctx.restore();
}

/**
 * Reads the icon's path geometry straight off the React element the
 * `react-icons` component returns. This keeps the locked icon imports as the
 * single source of the artwork without dragging `react-dom/server` into the
 * bundle to stringify six glyphs.
 */
function iconPaths(kind: MarketLocationKind): string[] {
  const cached = iconPathCache[kind];
  if (cached) return cached;

  const paths: string[] = [];
  try {
    const children = elementProps(kindIcon[kind]({}))?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const definition = elementProps(child)?.d;
      if (typeof definition === "string" && definition) paths.push(definition);
    }
  } catch {
    // A shape change upstream must degrade to a plain coloured pin, not crash.
  }

  iconPathCache[kind] = paths;
  return paths;
}

function elementProps(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || !("props" in value)) return null;
  const { props } = value as { props: unknown };
  return typeof props === "object" && props !== null ? (props as Record<string, unknown>) : null;
}
