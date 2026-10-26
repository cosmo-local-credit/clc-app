import { marketMapQueryOptions } from "@clc/api/features/market-map/queries";
import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import type {
  MarketMapCluster,
  MarketMapKind,
  MarketMapMarker,
} from "@clc/core/features/market-map/logic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { marketMapClient } from "#/lib/api/market-map";
import type { MarketLocation } from "#/features/home/ui/market-data";

type MarketMapLocation = MarketLocation & {
  resourceKind: MarketMapKind;
  resourceId: string;
};

type UseMarketMapOptions = {
  bounds: readonly MarketBoundingBox[];
  zoom: number;
  kinds: readonly MarketMapKind[];
  filter: Pick<CatalogFilter, "term" | "tags" | "tagMatch">;
  creditablePools?: readonly { chainId: number; address: string }[];
  facets: boolean;
  enabled: boolean;
};

export function useMarketMap(options: UseMarketMapOptions) {
  const query = useQuery({
    ...marketMapQueryOptions(marketMapClient, {
      bounds: options.bounds,
      zoom: options.zoom,
      kinds: options.kinds,
      filter: options.filter,
      creditablePools: options.creditablePools,
      facets: options.facets,
    }),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
  });

  const locations = useMemo(
    () =>
      options.enabled
        ? (query.data?.features.filter(isMarker).map(toLocation) ?? [])
        : ([] as MarketMapLocation[]),
    [options.enabled, query.data],
  );
  const clusters = useMemo(
    () =>
      options.enabled ? (query.data?.features.filter(isCluster) ?? []) : ([] as MarketMapCluster[]),
    [options.enabled, query.data],
  );
  const retry = useCallback(() => void query.refetch(), [query.refetch]);

  return {
    locations,
    clusters,
    tagFacets: options.enabled ? (query.data?.tagFacets ?? []) : [],
    error: options.enabled ? query.error : null,
    retry,
    retrying: options.enabled && query.isFetching,
    status: !options.enabled
      ? ("disabled" as const)
      : query.isPending
        ? ("loading" as const)
        : query.isError
          ? ("error" as const)
          : ("ready" as const),
  };
}

function isMarker(feature: MarketMapMarker | MarketMapCluster): feature is MarketMapMarker {
  return feature.type === "marker";
}

function isCluster(feature: MarketMapMarker | MarketMapCluster): feature is MarketMapCluster {
  return feature.type === "cluster";
}

function toLocation(marker: MarketMapMarker): MarketMapLocation {
  return {
    id: marker.id,
    resourceKind: marker.kind,
    resourceId: marker.resourceId,
    name: marker.name,
    kind: marker.kind,
    markerIcon: marker.markerIcon,
    markerColor: marker.markerColor,
    lat: marker.lat,
    lng: marker.lng,
    locationName: null,
  };
}
