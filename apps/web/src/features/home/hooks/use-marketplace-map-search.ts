import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { EMPTY_CATALOG_FILTER, type CatalogFilter } from "@clc/core/features/catalog/logic";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import {
  filterNearbyCatalog,
  nearbyQueryPolicy,
  useNearbyCatalog,
  useNearbyCatalogFilter,
} from "#/components/nearby-catalog";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { marketplaceClient } from "#/lib/api/marketplace";
import type { MarketPoolLocation } from "./use-market-pools";
import type { MarketLocation } from "#/features/home/ui/market-data";

const MAP_SEARCH_PAGE_SIZE = 100;
const MAX_MAP_SEARCH_PAGES = 6;

class MarketplaceMapSearchTooLargeError extends Error {
  constructor() {
    super("The filtered marketplace exceeded the complete map search limit.");
    this.name = "MarketplaceMapSearchTooLargeError";
  }
}

export type MarketVoucherSearchLocation = MarketLocation & {
  kind: "goods" | "services" | "voucher";
  address: `0x${string}`;
};

export function useMarketplaceMapSearch(
  filter: CatalogFilterControls,
  pools: readonly { chainId: number; address: string }[] | undefined,
  enabled: boolean,
) {
  const nearby = useNearbyCatalog();
  const visibility = useNearbyCatalogFilter();
  const parsed: CatalogFilter = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const params = {
    perPage: MAP_SEARCH_PAGE_SIZE,
    q: parsed.term,
    tags: parsed.tags,
    tagMatch: parsed.tagMatch,
    kinds: ["voucher", "pool"] as const,
    nearby: !!nearby,
    scope: nearby,
    ...(pools ? { pools } : {}),
  };
  const query = useQuery({
    queryKey: marketplaceKeys.list(params),
    queryFn: async ({ signal }) => {
      const rows: MarketplaceResult[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_MAP_SEARCH_PAGES; page++) {
        const result = await marketplaceClient.list({ ...params, cursor }, signal);
        rows.push(...result.results);
        cursor = result.nextCursor ?? undefined;
        if (!cursor) return rows;
      }
      throw new MarketplaceMapSearchTooLargeError();
    },
    enabled,
    ...nearbyQueryPolicy(nearby),
  });

  const locations = useMemo(() => {
    const byIdentity = new Map<string, MarketPoolLocation | MarketVoucherSearchLocation>();
    for (const row of query.data ?? []) {
      if (row.kind === "voucher") {
        byIdentity.set(`voucher:${row.chainId}:${row.address.toLowerCase()}`, {
          id: `market:voucher:${row.id}`,
          name: row.name,
          kind: row.voucherKind,
          markerIcon: row.markerIcon,
          markerColor: row.markerColor,
          lat: row.geoLat,
          lng: row.geoLng,
          locationName: row.locationName,
          address: row.address as `0x${string}`,
        });
      } else if (row.kind === "pool") {
        byIdentity.set(`pool:${row.chainId}:${row.address.toLowerCase()}`, {
          id: `market:pool:${row.id}`,
          name: row.name,
          kind: "pool",
          markerIcon: null,
          markerColor: null,
          lat: row.geoLat,
          lng: row.geoLng,
          locationName: row.locationName,
          address: row.address as `0x${string}`,
        });
      }
    }
    return filterNearbyCatalog([...byIdentity.values()], visibility);
  }, [query.data, visibility]);

  const retry = useCallback(() => void query.refetch(), [query]);
  return {
    locations,
    status: !enabled ? "disabled" : query.isPending ? "loading" : query.isError ? "error" : "ready",
    error: enabled ? query.error : null,
    retry,
    retrying: enabled && query.isFetching,
  } as const;
}
