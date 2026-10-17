import { lazy } from "react";

export const VoucherSheetFull = lazy(() =>
  import("./voucher-sheet-full").then((module) => ({
    default: module.VoucherSheetFull,
  })),
);
