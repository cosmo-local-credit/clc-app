import type { Theme } from "#/providers/theme";

export type MarketMapMode = "standard" | "satellite";

const MAPTILER_STYLE_ID: Record<Theme, string> = {
  light: "hybrid-v4",
  dark: "hybrid-v4-dark",
};

const STANDARD_STYLE_URL: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "/map-styles/liberty-dark.json",
};

export function standardMapStyleUrl(theme: Theme): string {
  return STANDARD_STYLE_URL[theme];
}

export function satelliteMapStyleUrl(
  apiKey: string | null | undefined,
  theme: Theme,
): string | null {
  if (!apiKey) return null;
  const style = MAPTILER_STYLE_ID[theme];
  return `https://api.maptiler.com/maps/${style}/style.json?key=${encodeURIComponent(apiKey)}`;
}

/*
 * Standard maps intentionally use a keyless provider. A revoked MapTiler key
 * must not make the Marketplace, location pickers, and voucher maps unusable.
 * Satellite remains a MapTiler enhancement and can fall back to Standard.
 */
export function resolveMapStyleUrl(
  apiKey: string | null | undefined,
  theme: Theme,
  mode: MarketMapMode,
): string {
  return mode === "satellite"
    ? (satelliteMapStyleUrl(apiKey, theme) ?? standardMapStyleUrl(theme))
    : standardMapStyleUrl(theme);
}
