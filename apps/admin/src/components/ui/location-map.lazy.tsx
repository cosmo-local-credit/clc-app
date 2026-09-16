import { lazy } from "react";

/**
 * The only way this console should reach the map.
 *
 * MapLibre and its stylesheet dwarf everything else here, and a static import
 * would put them in the shell chunk `check:bundle` guards — paid for on the
 * dashboard, the tables and the sign-in screen, none of which draw a map.
 */
export const LocationMap = lazy(() =>
  import("#/components/ui/location-map").then((module) => ({
    default: module.LocationMap,
  })),
);
