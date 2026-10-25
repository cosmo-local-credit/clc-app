import { marketplaceKeys } from "@clc/api/features/marketplace/queries";
import { EMPTY_CATALOG_FILTER, type CatalogFilter } from "@clc/core/features/catalog/logic";
import type { MarketplaceKind, MarketplaceResult } from "@clc/core/features/marketplace/logic";
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
import type { MarketCatalogLocation } from "./use-market-catalogs";

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
  kinds: readonly MarketplaceKind[],
  enabled: boolean,
  facets = false,
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
    kinds,
    nearby: false,
    scope: discovery.scope,
    bounds,
    ...(pools ? { pools } : {}),
    facets,
  };
  const query = useQuery({
    queryKey: marketplaceKeys.list(params),
    queryFn: async ({ signal }) => {
      const rows: MarketplaceResult[] = [];
      let tagFacets: { tag: string; count: number }[] = [];
      let cursor: string | undefined;
      for (;;) {
        const result = await marketplaceClient.list({ ...params, cursor }, signal);
        rows.push(...result.results);
        if (!cursor) tagFacets = result.tagFacets ?? [];
        cursor = result.nextCursor ?? undefined;
        if (!cursor) return { rows, tagFacets };
      }
    },
    enabled,
    placeholderData: keepPreviousData,
    ...nearbyQueryPolicy(discovery),
  });

  const locations = useMemo(() => {
    if (!enabled) return [];
    const byIdentity = new Map<
      string,
      | MarketPoolLocation
      | MarketVoucherSearchLocation
      | MarketWantSearchLocation
      | MarketCatalogLocation
    >();
    for (const row of query.data?.rows ?? []) {
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
      } else if (row.kind === "catalog") {
        byIdentity.set(`catalog:${row.id}`, {
          id: `market:catalog:${row.id}`,
          catalogId: row.id,
          name: row.name,
          kind: "catalog",
          markerIcon: null,
          markerColor: null,
          lat: row.geoLat,
          lng: row.geoLng,
          locationName: row.locationName,
        });
      }
    }
    return [...byIdentity.values()];
  }, [enabled, query.data]);

  const retry = useCallback(() => void query.refetch(), [query]);
  return {
    locations,
    tagFacets: enabled ? (query.data?.tagFacets ?? []) : [],
    status: !enabled ? "disabled" : query.isPending ? "loading" : query.isError ? "error" : "ready",
    error: enabled ? query.error : null,
    retry,
    retrying: enabled && query.isFetching,
  } as const;
}

/** First-page facet counts for the currently selected commerce pin types. */
export function useMarketplaceMapFacets(
  bounds: readonly MarketBoundingBox[],
  kinds: readonly MarketplaceKind[],
  enabled: boolean,
) {
  const params = {
    perPage: 1,
    q: "",
    tags: [] as string[],
    tagMatch: "any" as const,
    kinds,
    nearby: false,
    scope: `map-facets:${marketBoundsKey(bounds)}`,
    bounds,
    facets: true,
  };
  const query = useQuery({
    queryKey: marketplaceKeys.list(params),
    queryFn: ({ signal }) => marketplaceClient.list(params, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
  return enabled ? (query.data?.tagFacets ?? []) : [];
}
