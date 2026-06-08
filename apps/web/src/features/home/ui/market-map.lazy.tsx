import { lazy } from "react";

export const MarketMap = lazy(() =>
  import("./market-map").then((module) => ({
    default: module.MarketMap,
  })),
);
