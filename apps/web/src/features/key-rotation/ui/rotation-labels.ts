import type { RotationAssetKind } from "@clc/core/features/key-rotation/logic";
import { useLingui } from "@lingui/react/macro";

import type { SkippedReason } from "../api/discover-rotation-assets";

/** People-facing names for what moves and why something stays. */
export function useRotationLabels() {
  const { t } = useLingui();
  const kind = (value: RotationAssetKind) =>
    value === "pool"
      ? t`Pool`
      : value === "voucher"
        ? t`Voucher`
        : value === "native"
          ? t`Gas balance`
          : t`Balance`;
  const reason = (value: SkippedReason) =>
    value === "expired"
      ? t`Expired, so it cannot move`
      : value === "sealed-fee-address"
        ? t`Fees keep going to the old card: the fee address is sealed`
        : t`Could not be moved`;
  return { kind, reason };
}
