import {
  MARKER_COLOR_HEX,
  type MarkerIcon,
  type MarkerStyle,
  resolveMarkerStyle,
} from "@clc/core/features/markers/logic";
import type MapLibreGL from "maplibre-gl";

import { MARKER_GLYPHS } from "#/components/vouchers/marker-glyphs";
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

type PinShape = { radius: number; tail: number };

/**
 * A Google Maps place pin: a disc that tapers to a short point at the
 * location it marks. 24 px across, 28 px when selected. Logical pixels.
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

let iconPathCache: Partial<Record<MarkerIcon, string[]>> = {};

export function resetMarketMarkerCache(): void {
  iconPathCache = {};
}

/**
 * Registers the pins these vouchers draw, before the source that references
 * them is given its data.
 *
 * Only the styles in use are drawn, so the atlas holds a handful of images
 * rather than every icon and colour pair. Done ahead of `setData` rather than
 * from `styleimagemissing`, which MapLibre 6 no longer lets a listener answer.
 * Repeat calls cost one `Set` lookup per voucher.
 */
export function addMarketMarkerImages(
  map: MapLibreGL.Map,
  locations: Iterable<Pick<MarketLocation, "kind" | "markerIcon" | "markerColor">>,
): void {
  const seen = new Set<string>();
  for (const location of locations) {
    const style = resolveMarkerStyle(location);
    const imageId = markerImageId(style);
    if (seen.has(imageId)) continue;
    seen.add(imageId);
    addImage(map, imageId, style, markerPin.base);
    addImage(map, imageId + SELECTED_PIN_SUFFIX, style, markerPin.selected);
  }
}

function addImage(map: MapLibreGL.Map, imageId: string, style: MarkerStyle, shape: PinShape): void {
  if (map.hasImage(imageId)) return;
  const image = createMarkerImage(style, shape);
  if (!image) return;
  map.addImage(imageId, image.data, { pixelRatio: image.pixelRatio });
}

/**
 * Fills come from the shared palette, which stays off `--primary`: the
 * live-location pin owns the brand colour (green on prod, red on staging).
 */
function createMarkerImage(
  { icon, color }: MarkerStyle,
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
  ctx.fillStyle = MARKER_COLOR_HEX[color].pin;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineJoin = "round";
  ctx.stroke();

  drawGlyph(ctx, icon, center, radius * 2 * GLYPH_FRACTION);

  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio };
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  icon: MarkerIcon,
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
  for (const definition of iconPaths(icon)) {
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
function iconPaths(icon: MarkerIcon): string[] {
  const cached = iconPathCache[icon];
  if (cached) return cached;

  const paths: string[] = [];
  try {
    const children = elementProps(MARKER_GLYPHS[icon]({}))?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const definition = elementProps(child)?.d;
      if (typeof definition === "string" && definition) paths.push(definition);
    }
  } catch {
    // A shape change upstream must degrade to a plain coloured pin, not crash.
  }

  iconPathCache[icon] = paths;
  return paths;
}

function elementProps(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || !("props" in value)) return null;
  const { props } = value as { props: unknown };
  return typeof props === "object" && props !== null ? (props as Record<string, unknown>) : null;
}
