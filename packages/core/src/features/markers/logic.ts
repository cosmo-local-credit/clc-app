import { z } from "zod";

/**
 * The glyphs an issuer may put inside their voucher's map pin.
 *
 * The values are clc-core's `voucher_marker_icon` rows, so a write sends them
 * unchanged and a value outside this list is one this client cannot draw. Each
 * app maps every slug to its artwork with an exhaustive record, so adding one
 * here fails the typecheck until both apps can draw it.
 *
 * The first three are the automatic pins, in the order of `MarketKind`.
 */
export const MARKER_ICONS = [
  "basket",
  "hand-coin",
  "coupon",
  "food",
  "farm",
  "tools",
  "health",
  "education",
] as const;

export type MarkerIcon = (typeof MARKER_ICONS)[number];

/**
 * Legacy pin fills accepted by clc-core. Current clients preserve these values
 * on writes for compatibility, but presentation uses `RESOURCE_COLOR_HEX`.
 */
export const MARKER_COLORS = ["blue", "purple", "orange", "pink", "cyan", "brown"] as const;

export type MarkerColor = (typeof MARKER_COLORS)[number];

export type MarkerStyle = { icon: MarkerIcon; color: MarkerColor };

export const WANT_MARKER_ICONS = ["question", "message", "request"] as const;
export type WantMarkerIcon = (typeof WANT_MARKER_ICONS)[number];

export const REPORT_MARKER_ICONS = ["post", "event", "announcement"] as const;
export type ReportMarkerIcon = (typeof REPORT_MARKER_ICONS)[number];
export type ReportMarkerStyle = { icon: ReportMarkerIcon; color: MarkerColor };
export type MapMarkerStyle =
  | MarkerStyle
  | { icon: WantMarkerIcon; color: MarkerColor }
  | ReportMarkerStyle;

/**
 * Fixed sRGB per colour: the pin's fill, and a darker shade for the name beside
 * it, the way Google Maps colours a place's label. Hex because the pin is drawn
 * on a canvas, where an oklch token is silently ignored by older
 * implementations. Every fill keeps at least 3:1 against the white glyph.
 */
export const MARKER_COLOR_HEX: Record<MarkerColor, { pin: string; label: string }> = {
  blue: { pin: "#2563eb", label: "#1d4ed8" },
  purple: { pin: "#7c3aed", label: "#6d28d9" },
  orange: { pin: "#ea580c", label: "#c2410c" },
  pink: { pin: "#db2777", label: "#be185d" },
  cyan: { pin: "#0891b2", label: "#0e7490" },
  brown: { pin: "#92400e", label: "#78350f" },
};

/** Fixed resource identity colours used by map artwork and app accents. */
export const RESOURCE_COLOR_HEX = {
  voucher: { pin: "#007A55", label: "#006644" },
  offer: { pin: "#007A55", label: "#006644" },
  want: { pin: "#EA580C", label: "#C2410C" },
  pool: { pin: "#125A98", label: "#054980" },
  catalog: { pin: "#7C3AED", label: "#6D28D9" },
  post: { pin: "#52525B", label: "#3F3F46" },
} as const;

/** What a voucher offers, as clc-core derives it for the market map. */
const MARKET_KINDS = ["goods", "services", "voucher"] as const;

export type MarketKind = (typeof MARKET_KINDS)[number];

/**
 * The legacy marker defaults a voucher sends when its issuer chose nothing.
 * Current presentation uses the icon while resource identity owns the colour.
 */
export const KIND_DEFAULT_MARKER: Record<MarketKind, MarkerStyle> = {
  goods: { icon: "basket", color: "blue" },
  services: { icon: "hand-coin", color: "purple" },
  voucher: { icon: "coupon", color: "orange" },
};

export function isMarketKind(value: unknown): value is MarketKind {
  return typeof value === "string" && (MARKET_KINDS as readonly string[]).includes(value);
}

export function isMarkerIcon(value: unknown): value is MarkerIcon {
  return typeof value === "string" && (MARKER_ICONS as readonly string[]).includes(value);
}

export function isMarkerColor(value: unknown): value is MarkerColor {
  return typeof value === "string" && (MARKER_COLORS as readonly string[]).includes(value);
}

export function isWantMarkerIcon(value: unknown): value is WantMarkerIcon {
  return typeof value === "string" && (WANT_MARKER_ICONS as readonly string[]).includes(value);
}

export function isReportMarkerIcon(value: unknown): value is ReportMarkerIcon {
  return typeof value === "string" && (REPORT_MARKER_ICONS as readonly string[]).includes(value);
}

/**
 * Resolve the icon and legacy wire colour independently. Current clients draw
 * the icon in the voucher resource colour.
 */
export function resolveMarkerStyle(voucher: {
  kind: MarketKind;
  markerIcon: MarkerIcon | null;
  markerColor: MarkerColor | null;
}): MarkerStyle {
  const automatic = KIND_DEFAULT_MARKER[voucher.kind];
  return {
    icon: voucher.markerIcon ?? automatic.icon,
    color: voucher.markerColor ?? automatic.color,
  };
}

export const markerIconSchema = z.enum(MARKER_ICONS);
export const markerColorSchema = z.enum(MARKER_COLORS);
export const wantMarkerIconSchema = z.enum(WANT_MARKER_ICONS);
export const reportMarkerIconSchema = z.enum(REPORT_MARKER_ICONS);
