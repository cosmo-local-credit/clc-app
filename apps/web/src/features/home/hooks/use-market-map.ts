import { marketMapPointsQueryOptions } from "@clc/api/features/market-map/queries";
import type { CatalogFilter, VoucherRef } from "@clc/core/features/catalog/logic";
import { DEFAULT_POST_TIMING, type PostTiming } from "@clc/core/features/reports/logic";
import type {
  MarketMapKind,
  MarketMapPoint,
  MarketMapPointsResponse,
} from "@clc/core/features/market-map/logic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { marketMapClient } from "#/lib/api/market-map";
import type { MarketLocation } from "#/features/home/ui/market-data";

type MarketMapLocation = MarketLocation & {
  resourceKind: MarketMapKind;
  resourceId: string;
};

type UseMarketMapOptions = {
  kinds: readonly MarketMapKind[];
  filter: Pick<CatalogFilter, "term" | "tags" | "tagMatch">;
  creditablePools?: readonly { chainId: number; address: string }[];
  postTiming?: PostTiming;
  postVouchers?: readonly VoucherRef[];
  postVoucherMatch?: "any" | "all";
  postPools?: readonly VoucherRef[];
  postPoolMatch?: "any" | "all";
  enabled: boolean;
};

/**
 * Every point the filters match, fetched once per filter. The map clusters
 * them itself, so panning and zooming never reach the network.
 */
export function useMarketMap(options: UseMarketMapOptions) {
  const query = useQuery({
    ...marketMapPointsQueryOptions(marketMapClient, {
      kinds: options.kinds,
      filter: options.filter,
      creditablePools: options.creditablePools,
      postTiming: options.postTiming ?? DEFAULT_POST_TIMING,
      postVouchers: options.postVouchers,
      postVoucherMatch: options.postVoucherMatch,
      postPools: options.postPools,
      postPoolMatch: options.postPoolMatch,
    }),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
  });
  const lastSuccess = useRef<MarketMapPointsResponse | undefined>(undefined);
  useEffect(() => {
    if (!options.enabled) lastSuccess.current = undefined;
    else if (query.isSuccess && !query.isPlaceholderData) lastSuccess.current = query.data;
  }, [options.enabled, query.data, query.isPlaceholderData, query.isSuccess]);
  const data = query.data ?? lastSuccess.current;

  const locations = useMemo(
    () => (options.enabled ? (data?.points.map(toLocation) ?? []) : ([] as MarketMapLocation[])),
    [options.enabled, data],
  );
  const retry = useCallback(() => void query.refetch(), [query.refetch]);

  return {
    locations,
    /** More points matched than one response carries. */
    truncated: options.enabled && data?.truncated === true,
    error: options.enabled ? query.error : null,
    /** A successful response, fresh or retained, exists for what is on the map. */
    hasData: options.enabled && data !== undefined,
    retry,
    retrying: options.enabled && query.isFetching,
    isFetching: options.enabled && query.isFetching,
    isPlaceholderData: options.enabled && query.isPlaceholderData,
    isSettled: options.enabled && query.isSuccess && !query.isFetching && !query.isPlaceholderData,
    status: !options.enabled
      ? ("disabled" as const)
      : query.isPending
        ? ("loading" as const)
        : query.isError
          ? ("error" as const)
          : query.isPlaceholderData || query.isFetching
            ? ("refreshing" as const)
            : ("ready" as const),
  };
}

function toLocation(point: MarketMapPoint): MarketMapLocation {
  return {
    id: `marker:${point.kind}:${point.resourceId}`,
    resourceKind: point.kind,
    resourceId: point.resourceId,
    name: point.name,
    kind: point.kind,
    markerIcon: point.markerIcon,
    markerColor: point.markerColor,
    lat: point.lat,
    lng: point.lng,
    locationName: null,
  };
}
