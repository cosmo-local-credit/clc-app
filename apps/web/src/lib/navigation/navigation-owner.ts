import type { HomeTab } from "#/lib/navigation/home-tabs";

export type NavOwner = HomeTab | "home" | "voucher";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    navOwner?: NavOwner;
    /** Desktop canvas. Absent routes render the phone view in a 430px column. */
    desktop?: "fill" | "map";
  }
}
