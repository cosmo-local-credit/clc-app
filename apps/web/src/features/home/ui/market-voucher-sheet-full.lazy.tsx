import { lazy } from "react";

export const MarketVoucherSheetFull = lazy(() =>
  import("./market-voucher-sheet-full").then((module) => ({
    default: module.MarketVoucherSheetFull,
  })),
);
