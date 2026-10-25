import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { wantKeys } from "@clc/api/features/wants/queries";
import { wantsClient } from "#/lib/api/wants";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import type { MarketWantSearchLocation } from "./use-marketplace-map-search";

const PAGE_SIZE = 100;

export function useMarketMapWants(bounds: readonly MarketBoundingBox[], enabled: boolean) {
  const query = useQuery({
    queryKey: [...wantKeys.all, "map", bounds],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const wants = [];
      let cursor: number | undefined;
      for (;;) {
        const page = await wantsClient.list({ perPage: PAGE_SIZE, cursor, bounds }, signal);
        wants.push(...page.wants);
        if (
          page.wants.length < PAGE_SIZE ||
          page.last === 0 ||
          (cursor !== undefined && page.last >= cursor)
        )
          return wants;
        cursor = page.last;
      }
    },
  });

  const wants = useMemo<MarketWantSearchLocation[]>(() => {
    if (!enabled) return [];
    return (query.data ?? []).map((want) => ({
      id: `market:want:${want.id}`,
      wantId: want.id,
      name: want.name,
      kind: "want",
      markerIcon: want.markerIcon,
      markerColor: want.markerColor,
      lat: want.geoLat,
      lng: want.geoLng,
      locationName: want.locationName,
    }));
  }, [enabled, query.data]);
  const retry = useCallback(() => void query.refetch(), [query]);
  return {
    wants,
    error: enabled ? query.error : null,
    retry,
    retrying: enabled && query.isFetching,
  } as const;
}
