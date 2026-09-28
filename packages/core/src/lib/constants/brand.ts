/**
 * Deploy brand: prod is green, staging is red.
 *
 * One codebase serves both environments and `VITE_BRAND` is the only thing that
 * tells them apart at build time, so every surface that has to name a colour in
 * sRGB — the PWA `theme-color` meta, the web manifests, map pins, canvas
 * fallbacks — reads it from here. Both apps resolve the brand through
 * `resolveBrand`; neither app can import the other, and a palette that drifts
 * between them makes one environment read as two products.
 *
 * These values mirror the `--primary` token each app's stylesheet sets for
 * `:root[data-brand=...]` and `.dark[data-brand=...]`.
 */
export type Brand = "prod" | "staging";

export const BRAND_PRIMARY_COLOR: Record<Brand, { light: string; dark: string }> = {
  prod: { light: "#007a55", dark: "#009268" },
  staging: { light: "#e7000b", dark: "#fb2c36" },
};

/**
 * Unset is prod, deliberately: a misconfigured production deploy must not look
 * like staging. Any other value is a typo and fails the build rather than
 * silently shipping the wrong colour.
 */
export function resolveBrand(raw: string | undefined): Brand {
  const value = raw?.trim();
  if (!value) return "prod";
  if (value !== "prod" && value !== "staging") {
    throw new Error(`VITE_BRAND=${value} is not a brand. Use "prod" or "staging".`);
  }
  return value;
}
