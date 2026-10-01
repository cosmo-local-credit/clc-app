import type { UserPool } from "@clc/api/features/pools/client";
import type { HexAddress, VoucherRef } from "@clc/core/features/catalog/logic";
import { poolSwapInputUpperBoundRaw } from "@clc/core/features/pool-swaps/logic";
import { poolDepositCap, poolDepositHeadroomRaw } from "@clc/core/features/pools/logic";

const POOL_CREDIT_VOUCHER_BATCH_SIZE = 12;

export type PoolCreditCandidate = {
  pool: UserPool;
  tokenAddresses: readonly HexAddress[];
};

export type PoolCreditInputCapacity = {
  walletBalanceRaw: string | null;
  poolBalanceRaw: string | null;
  registryAddress: string | null;
  registryAllowed: boolean | null;
  limiterAddress: string | null;
  limitRaw: string | null;
};

export type PoolCreditInputCapacityResult = {
  creditable: boolean;
  verificationGap: boolean;
};

/** Split relationship searches at clc-core's public catalog limit. */
export function chunkPoolCreditVouchers(
  vouchers: readonly VoucherRef[],
): readonly (readonly VoucherRef[])[] {
  const chunks: VoucherRef[][] = [];
  for (let index = 0; index < vouchers.length; index += POOL_CREDIT_VOUCHER_BATCH_SIZE) {
    chunks.push(vouchers.slice(index, index + POOL_CREDIT_VOUCHER_BATCH_SIZE));
  }
  return chunks;
}

/**
 * Merge the overlapping pool pages produced by independent voucher batches.
 *
 * A returned pool may have matched any voucher in its batch. Keeping the whole
 * batch is intentional: the pinned chain read below is the authority that says
 * which pair is still admitted. Addresses are deduplicated before that read so
 * a pool related to two batches never pays for the same pair twice.
 */
export function mergePoolCreditCandidates(
  batches: readonly {
    pools: readonly UserPool[];
    tokenAddresses: readonly HexAddress[];
  }[],
): PoolCreditCandidate[] {
  const candidates = new Map<string, { pool: UserPool; tokenAddresses: Map<string, HexAddress> }>();

  for (const batch of batches) {
    for (const pool of batch.pools) {
      const key = pool.address.toLowerCase();
      const candidate = candidates.get(key) ?? {
        pool,
        tokenAddresses: new Map<string, HexAddress>(),
      };
      candidate.pool = pool;
      for (const address of batch.tokenAddresses) {
        candidate.tokenAddresses.set(address.toLowerCase(), address);
      }
      candidates.set(key, candidate);
    }
  }

  return [...candidates.values()]
    .map(({ pool, tokenAddresses }) => ({
      pool,
      tokenAddresses: [...tokenAddresses.values()].sort((left, right) =>
        left.toLowerCase().localeCompare(right.toLowerCase()),
      ),
    }))
    .sort((left, right) => comparePoolIdsDescending(left.pool.id, right.pool.id));
}

/**
 * Whether one held voucher gives the pool positive input capacity.
 *
 * This deliberately stops before output liquidity or quote conversion. Those
 * are pair-specific choices made on the Swap screen; Credit only promises that
 * the pool will admit a positive input amount under the same wallet/cap rules.
 */
export function poolCreditInputCapacity(
  input: PoolCreditInputCapacity,
): PoolCreditInputCapacityResult {
  if (input.walletBalanceRaw === null) {
    return { creditable: false, verificationGap: true };
  }
  if (input.registryAddress && input.registryAllowed === null) {
    return { creditable: false, verificationGap: true };
  }
  if (input.registryAddress && !input.registryAllowed) {
    return { creditable: false, verificationGap: false };
  }
  if (input.limiterAddress && (input.poolBalanceRaw === null || input.limitRaw === null)) {
    return { creditable: false, verificationGap: true };
  }

  const cap = poolDepositCap(
    { limiterAddress: input.limiterAddress },
    { tokenLimit: input.limitRaw },
  );
  const depositHeadroomRaw = poolDepositHeadroomRaw(cap, input.poolBalanceRaw ?? "0");
  const upperBoundRaw = poolSwapInputUpperBoundRaw({
    walletBalanceRaw: input.walletBalanceRaw,
    depositHeadroomRaw,
  });

  if (upperBoundRaw === null) {
    return { creditable: false, verificationGap: true };
  }

  try {
    return { creditable: BigInt(upperBoundRaw) > 0n, verificationGap: false };
  } catch {
    return { creditable: false, verificationGap: true };
  }
}

function comparePoolIdsDescending(left: string, right: string): number {
  try {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    if (leftId === rightId) return 0;
    return leftId > rightId ? -1 : 1;
  } catch {
    return right.localeCompare(left);
  }
}
