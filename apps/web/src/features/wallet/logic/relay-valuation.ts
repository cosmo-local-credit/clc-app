import type { RelayValuationSnapshot } from "@clc/api/features/relayer/client";
import { formatVoucherUnitValue, type VoucherUnitValue } from "@clc/core/features/market/logic";

/** Resolve one submission-time claim and apply it to an exact canonical voucher amount. */
export function relaySnapshotUnitValue(
  snapshots: readonly RelayValuationSnapshot[] | undefined,
  tokenAddress: string,
  amount: string,
): VoucherUnitValue | null {
  const claim = snapshots?.find(
    (snapshot) => snapshot.tokenAddress.toLowerCase() === tokenAddress.toLowerCase(),
  );
  if (!claim) return null;
  return formatVoucherUnitValue(amount, claim.voucherValue, claim.voucherUoa);
}
