import { catalogKeys } from "@clc/api/features/catalogs/queries";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { catalogsClient } from "#/lib/api/catalogs";
import type { MarketLocation } from "#/features/home/ui/market-data";

const PAGE_SIZE = 100;

export type MarketCatalogLocation = MarketLocation & { kind: "catalog"; catalogId: string };

export function useMarketMapCatalogs(bounds: readonly MarketBoundingBox[], enabled: boolean) {
  const params = { scope: "map", nearby: false, bounds } as const;
  const query = useQuery({
    queryKey: catalogKeys.list(params),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const catalogs = [];
      let cursor: string | undefined;
      do {
        const page = await catalogsClient.list(
          { perPage: PAGE_SIZE, cursor, bounds, facets: false },
          signal,
        );
        catalogs.push(...page.catalogs);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return catalogs;
    },
  });

  const catalogs = useMemo<MarketCatalogLocation[]>(() => {
    if (!enabled) return [];
    return (query.data ?? []).map((catalog) => ({
      id: `market:catalog:${catalog.id}`,
      catalogId: catalog.id,
      name: catalog.name,
      kind: "catalog",
      markerIcon: null,
      markerColor: null,
      lat: catalog.geoLat,
      lng: catalog.geoLng,
      locationName: catalog.locationName,
    }));
  }, [enabled, query.data]);

  return {
    catalogs,
    error: enabled ? query.error : null,
    retry: useCallback(() => void query.refetch(), [query]),
    retrying: enabled && query.isFetching,
  } as const;
}
