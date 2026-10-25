import {
  MARKER_COLOR_HEX,
  type MarkerIcon,
  type MarkerStyle,
  resolveMarkerStyle,
} from "@clc/core/features/markers/logic";
import type MapLibreGL from "maplibre-gl";
import type { IconType } from "react-icons";
import { RiGroupFill, RiMessage2Line, RiQuestionLine, RiSpeakLine } from "react-icons/ri";

import { MARKER_GLYPHS } from "#/components/vouchers/marker-glyphs";
import type { Theme } from "#/providers/theme";
import type { MarketLocation } from "./market-data";

/** Appended to a pin's image id for the larger variant a selected voucher gets. */
export const SELECTED_PIN_SUFFIX = "-selected";

/**
 * One image per icon and colour a voucher on the map actually uses, plus its
 * selected variant. Cluster circles and counts are style layers, not images.
 */
export function markerImageId({ icon, color }: MarkerStyle): string {
  return `market-pin-${icon}-${color}`;
}

const WANT_GLYPHS = {
  question: RiQuestionLine,
  message: RiMessage2Line,
  request: RiSpeakLine,
} as const;

export const POOL_PIN_IMAGE_ID = "market-pin-pool";

export const MARKET_NETWORK_BADGE_IMAGE_ID: Record<Theme, string> = {
  light: "market-network-badge-light",
  dark: "market-network-badge-dark",
};

/** Fixed sRGB because these surfaces are painted into a Canvas image. */
export const MARKET_NETWORK_BADGE_COLOR: Record<
  Theme,
  { surface: string; ink: string; outline: string }
> = {
  light: { surface: "#ffffff", ink: "#18181b", outline: "#18181b" },
  dark: { surface: "#27272a", ink: "#fafafa", outline: "#ffffff" },
};

/**
 * The Pools button's `--info` blue, `oklch(0.46 0.12 250)`, in sRGB, and a
 * darker shade of it for the name. The pool pin wears the button's colour and
 * glyph so the two read as one thing; its square body keeps it apart from the
 * round voucher pins, some of which are blue too.
 */
export const POOL_PIN_HEX = { pin: "#125a98", label: "#054980" } as const;

type PinShape = { radius: number; tail: number };

type MarkerSource = Pick<MarketLocation, "kind" | "markerIcon" | "markerColor">;

/** Everything a location's pin is drawn from, and the shade its name takes. */
export type MarkerArt = {
  image: string;
  fill: string;
  label: string;
  glyph: IconType;
  body: "disc" | "square";
};

export function markerArt(location: MarkerSource): MarkerArt {
  if (location.kind === "pool") {
    return {
      image: POOL_PIN_IMAGE_ID,
      fill: POOL_PIN_HEX.pin,
      label: POOL_PIN_HEX.label,
      glyph: RiGroupFill,
      body: "square",
    };
  }
  if (location.kind === "want") {
    const icon =
      location.markerIcon === "message" || location.markerIcon === "request"
        ? location.markerIcon
        : "question";
    const color = location.markerColor ?? "orange";
    return {
      image: `market-pin-want-${icon}-${color}`,
      fill: MARKER_COLOR_HEX[color].pin,
      label: MARKER_COLOR_HEX[color].label,
      glyph: WANT_GLYPHS[icon],
      body: "disc",
    };
  }
  const style = resolveMarkerStyle({
    kind: location.kind,
    markerIcon: location.markerIcon as MarkerIcon | null,
    markerColor: location.markerColor,
  });
  return {
    image: markerImageId(style),
    fill: MARKER_COLOR_HEX[style.color].pin,
    label: MARKER_COLOR_HEX[style.color].label,
    glyph: MARKER_GLYPHS[style.icon],
    body: "disc",
  };
}

/**
 * A Google Maps place pin: a disc that tapers to a short point at the
 * location it marks. 24 px across, 28 px when selected. Logical pixels. A
 * pool's square is as wide as the disc, so names and fans sit the same way.
 */
export const markerPin = {
  base: { radius: 12, tail: 6 },
  selected: { radius: 14, tail: 7 },
  /** Room around the artwork for the white stroke and the drop shadow. */
  padding: 3,
} as const satisfies { base: PinShape; selected: PinShape; padding: number };

const GLYPH_FRACTION = 0.58;
const ICON_VIEWBOX = 24;
const STROKE_WIDTH = 1.5;
const SHADOW = { color: "rgba(0, 0, 0, 0.3)", blur: 2, offsetY: 1 };

let iconPathCache = new Map<IconType, string[]>();

export function resetMarketMarkerCache(): void {
  iconPathCache = new Map();
}

/**
 * Registers the pins these locations draw, before the source that references
 * them is given its data.
 *
 * Only the styles in use are drawn, so the atlas holds a handful of images
 * rather than every icon and colour pair. Done ahead of `setData` rather than
 * from `styleimagemissing`, which MapLibre 6 no longer lets a listener answer.
 * Repeat calls cost one `Set` lookup per location.
 */
export function addMarketMarkerImages(
  map: MapLibreGL.Map,
  locations: Iterable<MarkerSource>,
): void {
  const seen = new Set<string>();
  for (const location of locations) {
    const art = markerArt(location);
    if (seen.has(art.image)) continue;
    seen.add(art.image);
    addImage(map, art.image, art, markerPin.base);
    addImage(map, art.image + SELECTED_PIN_SUFFIX, art, markerPin.selected);
  }
}

/**
 * A neutral group marker: three connected nodes around an opaque count area.
 * Its opposing outline keeps the shape legible over streets and photography.
 */
export function addMarketNetworkBadgeImage(map: MapLibreGL.Map, theme: Theme): void {
  const imageId = MARKET_NETWORK_BADGE_IMAGE_ID[theme];
  if (map.hasImage(imageId)) return;

  const image = createNetworkBadgeImage(theme);
  if (image) map.addImage(imageId, image.data, { pixelRatio: image.pixelRatio });
}

function createNetworkBadgeImage(theme: Theme): { data: ImageData; pixelRatio: number } | null {
  const size = 44;
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * pixelRatio);
  canvas.height = Math.round(size * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(pixelRatio, pixelRatio);
  ctx.clearRect(0, 0, size, size);

  const { surface, ink, outline } = MARKET_NETWORK_BADGE_COLOR[theme];
  const center = { x: size / 2, y: size / 2 };
  const nodes = [
    { x: center.x, y: 4.5 },
    { x: 5.5, y: 34.5 },
    { x: 38.5, y: 34.5 },
  ];

  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const node of nodes) {
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(node.x, node.y);
    ctx.stroke();
  }

  // The contrasting outer disc doubles as a halo over unpredictable imagery.
  ctx.beginPath();
  ctx.arc(center.x, center.y, 17, 0, Math.PI * 2);
  ctx.fillStyle = outline;
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 3 * pixelRatio;
  ctx.shadowOffsetY = pixelRatio;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.beginPath();
  ctx.arc(center.x, center.y, 14.5, 0, Math.PI * 2);
  ctx.fillStyle = surface;
  ctx.fill();

  for (const node of nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = outline;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = surface;
    ctx.fill();
  }

  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio };
}

function addImage(map: MapLibreGL.Map, imageId: string, art: MarkerArt, shape: PinShape): void {
  if (map.hasImage(imageId)) return;
  const image = createMarkerImage(art, shape);
  if (!image) return;
  map.addImage(imageId, image.data, { pixelRatio: image.pixelRatio });
}

/**
 * Fills are fixed sRGB that stays off `--primary`: the live-location pin owns
 * the brand colour (green on prod, red on staging).
 */
function createMarkerImage(
  { fill, glyph, body }: MarkerArt,
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
  const tip = { x: center.x, y: center.y + radius + tail };

  ctx.beginPath();
  if (body === "square") {
    // Square corners, like every other surface in the app, over a notch that
    // points at the location: a callout rather than a place pin.
    const top = center.y - radius;
    const bottom = center.y + radius;
    ctx.moveTo(center.x - radius, top);
    ctx.lineTo(center.x + radius, top);
    ctx.lineTo(center.x + radius, bottom);
    ctx.lineTo(center.x + tail, bottom);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(center.x - tail, bottom);
    ctx.lineTo(center.x - radius, bottom);
  } else {
    // The two straight edges are tangents from the tip, so they meet the disc
    // without a kink.
    const spread = Math.acos(radius / (radius + tail));
    ctx.arc(center.x, center.y, radius, Math.PI / 2 + spread, Math.PI / 2 - spread);
    ctx.lineTo(tip.x, tip.y);
  }
  ctx.closePath();

  // Shadow geometry ignores the context transform, so it is scaled by hand.
  ctx.shadowColor = SHADOW.color;
  ctx.shadowBlur = SHADOW.blur * pixelRatio;
  ctx.shadowOffsetY = SHADOW.offsetY * pixelRatio;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineJoin = body === "square" ? "miter" : "round";
  ctx.stroke();

  drawGlyph(ctx, glyph, center, radius * 2 * GLYPH_FRACTION);

  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio };
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: IconType,
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
  for (const definition of iconPaths(glyph)) {
    ctx.fill(new Path2D(definition));
  }
  ctx.restore();
}

/**
 * Reads the icon's path geometry straight off the React element the
 * `react-icons` component returns. This keeps the locked icon imports as the
 * single source of the artwork without dragging `react-dom/server` into the
 * bundle to stringify the glyphs.
 */
function iconPaths(glyph: IconType): string[] {
  const cached = iconPathCache.get(glyph);
  if (cached) return cached;

  const paths: string[] = [];
  try {
    const children = elementProps(glyph({}))?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const definition = elementProps(child)?.d;
      if (typeof definition === "string" && definition) paths.push(definition);
    }
  } catch {
    // A shape change upstream must degrade to a plain coloured pin, not crash.
  }

  iconPathCache.set(glyph, paths);
  return paths;
}

function elementProps(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || !("props" in value)) return null;
  const { props } = value as { props: unknown };
  return typeof props === "object" && props !== null ? (props as Record<string, unknown>) : null;
}
