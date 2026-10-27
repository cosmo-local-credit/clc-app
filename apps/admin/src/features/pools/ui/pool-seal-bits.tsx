import type { UserPool } from "@clc/api/features/pools/client";
import {
  POOL_SEAL_FEE,
  POOL_SEAL_FEE_ADDRESS,
  POOL_SEAL_LIMITER,
  POOL_SEAL_QUOTER,
  POOL_SEAL_REGISTRY,
} from "@clc/core/features/pool-admin/logic";

import { Badge } from "#/components/ui/badge";
import { usePoolStewardState } from "../use-pool-steward";

const SEAL_BITS = [
  { bit: POOL_SEAL_FEE, label: "Fee" },
  { bit: POOL_SEAL_FEE_ADDRESS, label: "Fee recipient" },
  { bit: POOL_SEAL_QUOTER, label: "Quoter" },
  { bit: POOL_SEAL_REGISTRY, label: "Registry" },
  { bit: POOL_SEAL_LIMITER, label: "Limiter" },
] as const;

/** Seal bits read from SwapPool. A missing read is shown as unknown, not as open. */
export function PoolSealBits({ pool }: { pool: UserPool }) {
  const state = usePoolStewardState(pool);
  const seal = state.data?.sealState;

  if (state.isPending) {
    return <span className="text-muted-foreground font-mono text-xs">Reading</span>;
  }
  if (seal === null || seal === undefined) {
    return <span className="text-muted-foreground font-mono text-xs">Unavailable</span>;
  }
  if (seal === 0) {
    return <span className="font-mono text-xs uppercase">Open</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {SEAL_BITS.filter((item) => (seal & item.bit) === item.bit).map((item) => (
        <Badge key={item.bit} variant="outline" className="font-mono text-xs uppercase">
          {item.label}
        </Badge>
      ))}
    </span>
  );
}

export { SEAL_BITS };
