import { type Brand, BRAND_PRIMARY_COLOR, resolveBrand } from "@clc/core/lib/constants/brand";

/**
 * Deploy brand: prod is green, staging is red.
 *
 * Resolved once from `VITE_BRAND` because the palette is a property of the
 * build, not of the running session. Pages inlines the variable from wrangler
 * `[vars]`; a laptop build reads `.env` or the same wrangler block via
 * `loadWranglerViteVars`.
 */
export const BRAND: Brand = resolveBrand(import.meta.env.VITE_BRAND as string | undefined);

/** sRGB `--primary` for the PWA theme-color meta, map pins, and canvas fallbacks. */
export const BRAND_THEME_COLOR = BRAND_PRIMARY_COLOR[BRAND];

/**
 * Installable icons are per brand so an installed staging app is red on the
 * home screen and in the task switcher, not merely inside its own chrome. Both
 * sets ship; the build picks one by path rather than by swapping files, so
 * `develop` and `master` keep identical trees outside the two Wrangler configs.
 */
export const BRAND_ICON_BASE = `/brand/${BRAND}`;

/** Per-brand web manifest — theme colour, install name, and icon set. */
export const BRAND_MANIFEST_HREF = `/manifest.${BRAND}.webmanifest`;

/** Install name and tab title. QA runs both apps side by side on one device. */
export const BRAND_APP_NAME = BRAND === "staging" ? "CLC Staging" : "CLC";
