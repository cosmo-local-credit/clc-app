import type { HomeTab } from "#/lib/navigation/home-tabs";

/**
 * `install` is Settings' subpage when opened from there, and otherwise the
 * landing page a shared install link opens, which belongs with onboarding and
 * carries no navigation.
 */
export type NavOwner = HomeTab | "home" | "voucher" | "install";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    navOwner?: NavOwner;
    /** Desktop canvas. Absent routes render the phone view in a 430px column. */
    desktop?: "fill" | "map";
  }
}
