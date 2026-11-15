import type { PoolVoucher, UserPool } from "@clc/api/features/pools/client";

import {
  poolTokenRegistryAddress,
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
 * partial menu reads as "this pool doesn't take my voucher". A failed catalog is
 * not, where there is a registry: the chain then describes every member and the
 * menu is complete, only without icons. Without a registry the catalog is the
 * whole list, and its failure is the list's.
 */
export function usePoolSwapVouchers(pool: UserPool | null | undefined) {
  const catalog = usePoolVouchersWithStatus(pool, { all: true });
  const accepted = usePoolAcceptedVouchers(pool, catalog.vouchers);
  const hasRegistry = poolTokenRegistryAddress(pool) !== null;

  return {
    vouchers: accepted.vouchers,
    isPending: catalog.isPending || accepted.isPending,
    isError: accepted.isError || (catalog.isError && !hasRegistry),
    isFetching: catalog.isFetching || accepted.isFetching,
    refetch: () => {
      void catalog.refetch();
      accepted.refetch();
    },
  };
}

/**
 * Resolve the Pool's accepted Voucher set from its registry, enriching members
 * with catalog or token-contract metadata. Holdings and Swap share this exact
 * definition so a deposited token cannot be accepted on one screen and pending
 * on the other.
 */
export function usePoolAcceptedVouchers(
  pool: UserPool | null | undefined,
  catalogVouchers: readonly PoolVoucher[],
) {
  const registry = usePoolRegistryTokens(pool);
  const hasRegistry = poolTokenRegistryAddress(pool) !== null;

  const catalogAddresses = new Set(
    catalogVouchers.map((voucher) => voucher.tokenAddress.toLowerCase()),
  );
  const undescribed = (registry.data ?? []).filter(
    (address) => !catalogAddresses.has(address.toLowerCase()),
  );
  const metadata = usePoolTokenMetadata(undescribed);

  const registryPending = hasRegistry && registry.isPending;
  const registryError = hasRegistry && registry.isError;
  const metadataPending = undescribed.length > 0 && metadata.isPending;
  // The chain names every member the catalog lacks — every member, once the
  // catalog has failed. Unanswered, those rows cannot be sized, and a menu of
  // unusable rows is the same gap the registry read exists to close.
  const metadataError = undescribed.length > 0 && metadata.isError;
  // A failed background refresh retains TanStack Query's last successful data.
  // That set remains authoritative and may stay on screen. An initial failure
  // has no verified set and must not turn every positive balance into Pending.
  const registryUnavailable = registryError && registry.data === undefined;
  const metadataUnavailable = metadataError && metadata.data === undefined;
  const verified =
    !registryPending && !metadataPending && !registryUnavailable && !metadataUnavailable;

  return {
    vouchers: !verified
      ? []
      : poolVouchersFromRegistry({
          catalog: [...catalogVouchers],
          registry: hasRegistry ? (registry.data ?? []) : null,
          metadata: metadata.data,
        }),
    isPending: registryPending || metadataPending,
    isError: registryError || metadataError,
    verified,
    isFetching: registry.isFetching || metadata.isFetching,
    refetch: () => {
      void registry.refetch();
      if (undescribed.length > 0) void metadata.refetch();
    },
  };
}
