import { useEffect, useMemo } from "react";

import type { HexAddress } from "@clc/core/features/catalog/logic";
import { useUserPoolsInfinite } from "#/features/pools/hooks/use-user-pools";
import type { MarketLocation } from "#/features/home/ui/market-data";

/** clc-core caps a pool page at 100 rows. */
const MARKET_POOLS_PAGE_SIZE = 100;

export type MarketPoolLocation = MarketLocation & { kind: "pool"; address: HexAddress };

/**
 * Every pool with a location, as markers for the market map.
 *
 * The catalog is small enough to walk to the end: tens of pools against
 * thousands of vouchers. Ids are namespaced because a pool's catalog id and a
 * voucher's are both plain integers, and the map tells markers apart by id.
 */
export function useMarketMapPools(enabled: boolean): MarketPoolLocation[] {
  const { data, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage } = useUserPoolsInfinite(
    MARKET_POOLS_PAGE_SIZE,
    enabled,
  );

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetching || isFetchingNextPage) return;
    void fetchNextPage();
  }, [enabled, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage]);

  return useMemo(() => {
    if (!enabled) return [];

    const byAddress = new Map<string, MarketPoolLocation>();
    for (const page of data?.pages ?? []) {
      for (const pool of page.pools) {
        const lat = pool.geoLat;
        const lng = pool.geoLng;
        if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
        const address = pool.address.toLowerCase();
        byAddress.set(address, {
          id: `pool:${address}`,
          name: pool.name,
          kind: "pool",
          markerIcon: null,
          markerColor: null,
          lat,
          lng,
          locationName: pool.locationName,
          address: pool.address,
        });
      }
    }
    return [...byAddress.values()];
  }, [enabled, data?.pages]);
}
