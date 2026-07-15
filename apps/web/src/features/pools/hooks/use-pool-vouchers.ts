import { useMemo } from "react";

import type { UserPool } from "#/features/pools/api/pools-client";
import { getPlaceholderPoolVouchers } from "#/features/pools/data/placeholder-pool-vouchers";

export function usePoolVouchers(pool: UserPool | null | undefined) {
  return useMemo(() => (pool ? getPlaceholderPoolVouchers(pool) : []), [pool]);
}
