import type MapLibreGL from "maplibre-gl";
import type { IconType } from "react-icons";
import { RiCouponLine, RiHandCoinLine, RiShoppingBasket2Line } from "react-icons/ri";

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

/** Locked round marker: 24 px logical, thin white stroke, ~1.1x when selected. */
const MARKER_SIZE = 24;
const SELECTED_SCALE = 1.1;
const ICON_VIEWBOX = 24;
const GLYPH_FRACTION = 0.52;

const KIND_CSS_VARIABLE: Record<MarketLocationKind, string> = {
  goods: "--primary",
  services: "--info",
  voucher: "--foreground",
};

/**
 * sRGB duplicates of the project colour tokens.
 *
 * These exist ONLY because older Canvas implementations silently retain the
 * previous `fillStyle` when handed an unsupported `oklch(...)` string — the
 * marker would then paint in whatever colour happened to be set last, with no
 * error. They are not a second source of truth for the design system; they are
 * used only when `CSS.supports("color", "oklch(...)")` is false.
 */
const KIND_SRGB_FALLBACK: Record<MarketLocationKind, string> = {
  goods: "#0d7d6e",
  services: "#2563eb",
  voucher: "#1f2430",
};

const kindIcon: Record<MarketLocationKind, IconType> = {
  goods: RiShoppingBasket2Line,
  services: RiHandCoinLine,
  voucher: RiCouponLine,
};

let iconPathCache: Partial<Record<MarketLocationKind, string[]>> = {};

export function resetMarketMarkerCache(): void {
  iconPathCache = {};
}

export function addMarketMarkerImages(map: MapLibreGL.Map): void {
  for (const kind of MARKET_MARKER_KINDS) {
    addImage(map, markerImageIds.base[kind], kind, false);
    addImage(map, markerImageIds.selected[kind], kind, true);
  }
}

function addImage(
  map: MapLibreGL.Map,
  imageId: string,
  kind: MarketLocationKind,
  selected: boolean,
): void {
  if (map.hasImage(imageId)) return;
  const image = createMarkerImage(kind, selected);
  if (!image) return;
  map.addImage(imageId, image.data, { pixelRatio: image.pixelRatio });
}

function createMarkerImage(
  kind: MarketLocationKind,
  selected: boolean,
): { data: ImageData; pixelRatio: number } | null {
  const size = selected ? Math.round(MARKER_SIZE * SELECTED_SCALE) : MARKER_SIZE;
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * pixelRatio);
  canvas.height = Math.round(size * pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(pixelRatio, pixelRatio);
  ctx.clearRect(0, 0, size, size);

  const fill = resolveKindColor(kind);
  const center = size / 2;
  const ringInset = selected ? 1.75 : 0.75;
  const bodyRadius = center - (selected ? 3 : 1.25);

  if (selected) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center, center, center - ringInset, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(center, center, bodyRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.25;
  ctx.stroke();

  drawKindGlyph(ctx, kind, center, size * GLYPH_FRACTION);

  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio };
}

function drawKindGlyph(
  ctx: CanvasRenderingContext2D,
  kind: MarketLocationKind,
  center: number,
  glyphSize: number,
): void {
  // jsdom and very old WebViews lack Path2D; the coloured disc still renders.
  if (typeof Path2D === "undefined") return;

  const scale = glyphSize / ICON_VIEWBOX;
  ctx.save();
  ctx.translate(center - glyphSize / 2, center - glyphSize / 2);
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
    // A shape change upstream must degrade to a plain coloured disc, not crash.
  }

  iconPathCache[kind] = paths;
  return paths;
}

function elementProps(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || !("props" in value)) return null;
  const { props } = value as { props: unknown };
  return typeof props === "object" && props !== null ? (props as Record<string, unknown>) : null;
}

function resolveKindColor(kind: MarketLocationKind): string {
  if (!supportsCanvasOklch()) return KIND_SRGB_FALLBACK[kind];
  if (typeof document === "undefined") return KIND_SRGB_FALLBACK[kind];

  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(KIND_CSS_VARIABLE[kind])
    .trim();
  return resolved || KIND_SRGB_FALLBACK[kind];
}

function supportsCanvasOklch(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("color", "oklch(0.5 0.1 165)");
}
