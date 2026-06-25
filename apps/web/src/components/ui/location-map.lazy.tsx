import { lazy } from "react";

export const LocationMap = lazy(() =>
  import("#/components/ui/location-map").then((module) => ({
    default: module.LocationMap,
  })),
);
