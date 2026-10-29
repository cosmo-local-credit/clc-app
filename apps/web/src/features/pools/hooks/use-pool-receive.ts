import type { UserPool } from "@clc/api/features/pools/client";
import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";

import { CHAIN_ID } from "#/lib/chain";

/**
 * What a pool's receive surface shares: the chain-specific QR payload and the
 * name (or, for an unnamed pool, the address) that the copy control copies.
 */
export function usePoolReceive(pool: Pick<UserPool, "address"> & Partial<Pick<UserPool, "name">>) {
  const { t } = useLingui();
  const poolName = pool.name?.trim() || null;
  const receiveName = poolName ?? pool.address;
  const qrValue = `ethereum:${pool.address}@${CHAIN_ID}`;

  const copy = () => {
    if (!navigator.clipboard) {
      toast.error(poolName ? t`Couldn't copy pool name` : t`Couldn't copy address`);
      return;
    }
    void navigator.clipboard
      .writeText(receiveName)
      .then(() => toast.success(poolName ? t`Pool name copied` : t`Address copied`))
      .catch(() => toast.error(poolName ? t`Couldn't copy pool name` : t`Couldn't copy address`));
  };

  return { poolName, qrValue, copy };
}
