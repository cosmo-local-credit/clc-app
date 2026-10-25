import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { EMPTY_CATALOG_FILTER, type CatalogFilter } from "@clc/core/features/catalog/logic";
import type { MarketplaceResult } from "@clc/core/features/marketplace/logic";
import type { WantMarkerIcon } from "@clc/core/features/wants/logic";
import type { MarkerColor } from "@clc/core/features/markers/logic";
import { marketBoundsKey, type MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { nearbyQueryPolicy } from "#/components/nearby-catalog";
import type { CatalogFilterControls } from "#/lib/navigation/use-catalog-filter";
import { marketplaceClient } from "#/lib/api/marketplace";
import type { MarketPoolLocation } from "./use-market-pools";
import type { MarketLocation } from "#/features/home/ui/market-data";

const MAP_SEARCH_PAGE_SIZE = 100;

export type MarketVoucherSearchLocation = MarketLocation & {
  kind: "goods" | "services" | "voucher";
  address: `0x${string}`;
};

export type MarketWantSearchLocation = MarketLocation & {
  kind: "want";
  wantId: string;
  markerIcon: WantMarkerIcon;
  markerColor: MarkerColor;
};

export function useMarketplaceMapSearch(
  filter: CatalogFilterControls,
  pools: readonly { chainId: number; address: string }[] | undefined,
  bounds: readonly MarketBoundingBox[],
  enabled: boolean,
) {
  const parsed: CatalogFilter = filter.result.ok ? filter.result.filter : EMPTY_CATALOG_FILTER;
  const discovery = {
    nearby: false as const,
    scope: `map:${marketBoundsKey(bounds)}`,
    ...(bounds.length ? { bounds } : {}),
  };
  const params = {
    perPage: MAP_SEARCH_PAGE_SIZE,
    q: parsed.term,
    tags: parsed.tags,
    tagMatch: parsed.tagMatch,
    kinds: ["voucher", "pool", "want"] as const,
    nearby: false,
    scope: discovery.scope,
    bounds,
    ...(pools ? { pools } : {}),
  };
  const query = useQuery({
    queryKey: marketplaceKeys.list(params),
    queryFn: async ({ signal }) => {
      const rows: MarketplaceResult[] = [];
      let cursor: string | undefined;
      for (;;) {
        const result = await marketplaceClient.list({ ...params, cursor }, signal);
        rows.push(...result.results);
        cursor = result.nextCursor ?? undefined;
        if (!cursor) return rows;
      }
    },
    enabled,
    placeholderData: keepPreviousData,
    ...nearbyQueryPolicy(discovery),
  });

  const locations = useMemo(() => {
    const byIdentity = new Map<
      string,
      MarketPoolLocation | MarketVoucherSearchLocation | MarketWantSearchLocation
    >();
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
      } else if (row.kind === "want") {
        byIdentity.set(`want:${row.id}`, {
          id: `market:want:${row.id}`,
          wantId: row.id,
          name: row.name,
          kind: "want",
          markerIcon: row.markerIcon,
          markerColor: row.markerColor,
          lat: row.geoLat,
          lng: row.geoLng,
          locationName: row.locationName,
        });
      }
    }
    return [...byIdentity.values()];
  }, [query.data]);

  const retry = useCallback(() => void query.refetch(), [query]);
  return {
    locations,
    status: !enabled ? "disabled" : query.isPending ? "loading" : query.isError ? "error" : "ready",
    error: enabled ? query.error : null,
    retry,
    retrying: enabled && query.isFetching,
  } as const;
}
