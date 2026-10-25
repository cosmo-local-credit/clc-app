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
 * The pin fills an issuer may choose, as clc-core's `voucher_marker_color` rows.
 *
 * No red and no green: the live-location pin owns the brand colour, which is
 * green on prod and red on staging, and a voucher must never read as "you are
 * here".
 */
export const MARKER_COLORS = ["blue", "purple", "orange", "pink", "cyan", "brown"] as const;

export type MarkerColor = (typeof MARKER_COLORS)[number];

export type MarkerStyle = { icon: MarkerIcon; color: MarkerColor };

export const WANT_MARKER_ICONS = ["question", "message", "request"] as const;
export type WantMarkerIcon = (typeof WANT_MARKER_ICONS)[number];
export type WantMarkerStyle = { icon: WantMarkerIcon; color: MarkerColor };
export type MapMarkerStyle = MarkerStyle | WantMarkerStyle;

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

/** What a voucher offers, as clc-core derives it for the market map. */
const MARKET_KINDS = ["goods", "services", "voucher"] as const;

export type MarketKind = (typeof MARKET_KINDS)[number];

/**
 * The pin a voucher gets when its issuer chose nothing: goods are a blue
 * basket, services a purple hand-coin, and a voucher with no offerings an
 * orange coupon. Every voucher that predates the choice draws exactly this.
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

/**
 * The pin to draw. The icon and the colour are chosen independently, so a
 * voucher that picked only a colour keeps the glyph its offerings imply.
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
