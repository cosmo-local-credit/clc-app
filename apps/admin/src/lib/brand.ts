import { type Brand, BRAND_PRIMARY_COLOR, resolveBrand } from "@clc/core/lib/constants/brand";

/**
 * Deploy brand: prod is green, staging is blue.
 *
 * Same contract as apps/web — the two apps cannot import each other, so both
 * resolve the shared palette in `@clc/core` and the console and the PWA read as
 * one product on a given environment.
 */
export const BRAND: Brand = resolveBrand(import.meta.env.VITE_BRAND as string | undefined);

/** sRGB `--primary` for map pins and the browser UI hint that cannot consume `oklch(...)`. */
export const BRAND_THEME_COLOR = BRAND_PRIMARY_COLOR[BRAND];

/**
 * The console's mark is square (the shell has never carried a rounded tile) and
 * follows the brand, so an operator can tell a staging tab from a prod one by
 * its favicon alone. Both sets ship; the build picks one by path.
 */
export const BRAND_ICON_BASE = `/brand/${BRAND}`;
