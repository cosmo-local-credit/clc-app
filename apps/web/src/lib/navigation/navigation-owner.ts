import type { HomeTab } from "#/lib/navigation/home-tabs";

export type NavOwner = HomeTab | "home" | "voucher";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    navOwner?: NavOwner;
  }
}
