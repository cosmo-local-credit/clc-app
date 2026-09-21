/**
 * Deploy brand: prod is green, staging is blue.
 *
 * Same contract as apps/web — the two apps cannot import each other, and the
 * palette has to match so the console and the PWA read as one product on a
 * given environment. Unset or any value other than `staging` is prod.
 */
export type Brand = "prod" | "staging";

const raw = (import.meta.env.VITE_BRAND as string | undefined)?.trim();

if (raw && raw !== "prod" && raw !== "staging") {
  throw new Error(`VITE_BRAND=${raw} is not a brand. Use "prod" or "staging".`);
}

export const BRAND: Brand = raw === "staging" ? "staging" : "prod";

/** sRGB `--primary` for map pins that cannot consume `oklch(...)`. */
export const BRAND_THEME_COLOR: Record<"light" | "dark", string> =
  BRAND === "staging"
    ? { light: "#1762b8", dark: "#3178d0" }
    : { light: "#007a55", dark: "#009268" };
