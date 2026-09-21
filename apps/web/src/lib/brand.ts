/**
 * Deploy brand: prod is green, staging is blue.
 *
 * Resolved once from `VITE_BRAND` because the palette is a property of the
 * build, not of the running session. Pages inlines the variable from wrangler
 * `[vars]`; a laptop build reads `.env` or the same wrangler block via
 * `loadWranglerViteVars`. Unset or any value other than `staging` is prod —
 * a misconfigured prod deploy must not look like staging.
 */
export type Brand = "prod" | "staging";

const raw = (import.meta.env.VITE_BRAND as string | undefined)?.trim();

if (raw && raw !== "prod" && raw !== "staging") {
  throw new Error(`VITE_BRAND=${raw} is not a brand. Use "prod" or "staging".`);
}

export const BRAND: Brand = raw === "staging" ? "staging" : "prod";

/** sRGB `--primary` for the PWA theme-color meta, map pins, and canvas fallbacks. */
export const BRAND_THEME_COLOR: Record<"light" | "dark", string> =
  BRAND === "staging"
    ? { light: "#1762b8", dark: "#3178d0" }
    : { light: "#007a55", dark: "#009268" };
