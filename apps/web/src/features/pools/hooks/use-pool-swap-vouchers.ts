import type { UserPool } from "@clc/api/features/pools/client";

import {
  usePoolRegistryTokens,
  usePoolTokenMetadata,
} from "#/features/pools/hooks/use-pool-registry";
import { usePoolVouchersWithStatus } from "#/features/pools/hooks/use-pool-vouchers";
import { poolVouchersFromRegistry } from "#/features/pools/logic/pool-swap-tokens";

/**
 * The vouchers the swap menus offer: everything the pool's registry admits.
 *
 * The registry is enumerated on chain because the catalog's voucher list is a
 * projection that omits members — a token seeded when the pool was published, or
 * one the indexer has yet to catch up with. The catalog is still drained, but
 * only for what the chain cannot say: icons and descriptions. A member it does
 * not know is described by its own contract.
 *
 * An unreadable registry is an error, never a silent fallback to the catalog: a
 * partial menu reads as "this pool doesn't take my voucher".
 */
export function usePoolSwapVouchers(pool: UserPool | null | undefined) {
  const catalog = usePoolVouchersWithStatus(pool, { all: true });
  const registry = usePoolRegistryTokens(pool);
  const hasRegistry = !!pool?.tokenRegistryAddress;

  const catalogAddresses = new Set(
    catalog.vouchers.map((voucher) => voucher.tokenAddress.toLowerCase()),
  );
  const undescribed = (registry.data ?? []).filter(
    (address) => !catalogAddresses.has(address.toLowerCase()),
  );
  // Asked only once the catalog has settled: until then a member it is about to
  // list would be read from the chain for nothing.
  const metadata = usePoolTokenMetadata(catalog.isPending ? [] : undescribed);

  const registryPending = hasRegistry && registry.isPending;
  const registryError = hasRegistry && registry.isError;
  const metadataPending = undescribed.length > 0 && metadata.isPending;

  return {
    vouchers:
      registryError || registryPending
        ? []
        : poolVouchersFromRegistry({
            catalog: catalog.vouchers,
            registry: hasRegistry ? (registry.data ?? []) : null,
            metadata: metadata.data,
          }),
    isPending: catalog.isPending || registryPending || metadataPending,
    isError: catalog.isError || registryError,
    refetch: () => {
      void catalog.refetch();
      void registry.refetch();
      if (undescribed.length > 0) void metadata.refetch();
    },
  };
}
