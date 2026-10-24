import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { wantKeys } from "@clc/api/features/wants/queries";
import { wantsClient } from "#/lib/api/wants";
import type { MarketViewport } from "#/features/home/ui/market-map";
import type { MarketWantSearchLocation } from "./use-marketplace-map-search";

const PAGE_SIZE = 100;
const MAX_PAGES = 6;

export function useMarketMapWants(viewport: MarketViewport | null, enabled: boolean) {
  const bbox = viewport
    ? {
        minLng: viewport.west,
        minLat: viewport.south,
        maxLng: viewport.east,
        maxLat: viewport.north,
      }
    : null;
  const query = useQuery({
    queryKey: [...wantKeys.all, "map", bbox],
    enabled: enabled && bbox !== null,
    queryFn: async ({ signal }) => {
      if (!bbox) return [];
      const wants = [];
      let cursor: number | undefined;
      for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
        const page = await wantsClient.list({ perPage: PAGE_SIZE, cursor, bbox }, signal);
        wants.push(...page.wants);
        if (page.wants.length < PAGE_SIZE || page.last === 0) return wants;
        cursor = page.last;
      }
      throw new Error("The Want map result limit was exceeded.");
    },
  });

  const wants = useMemo<MarketWantSearchLocation[]>(
    () =>
      (query.data ?? []).map((want) => ({
        id: `market:want:${want.id}`,
        wantId: want.id,
        name: want.name,
        kind: "want",
        markerIcon: want.markerIcon,
        markerColor: want.markerColor,
        lat: want.geoLat,
        lng: want.geoLng,
        locationName: want.locationName,
      })),
    [query.data],
  );
  const retry = useCallback(() => void query.refetch(), [query]);
  return {
    wants,
    error: enabled ? query.error : null,
    retry,
    retrying: enabled && query.isFetching,
  } as const;
}
