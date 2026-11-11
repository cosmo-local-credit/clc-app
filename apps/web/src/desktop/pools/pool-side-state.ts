import type { PoolSide } from "#/desktop/pools/detail/pool-side-panel";
import type { PoolSideRequest } from "#/lib/navigation/pool-side";

/** The request a side the page just opened stands for. */
export function requestForSide(side: PoolSide): PoolSideRequest | null {
  switch (side.kind) {
    case "voucher":
      return { kind: "voucher", address: side.voucher.tokenAddress.toLowerCase() };
    case "activity":
      return { kind: "activity", key: side.entry.key };
    case "activityMissing":
      return null;
    default:
      return { kind: "tool", tool: side.kind };
  }
}
