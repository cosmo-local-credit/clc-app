import { reportMapQueryOptions } from "@clc/api/features/reports/queries";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import {
  EMPTY_CATALOG_FILTER,
  type CatalogFilter,
  type VoucherRef,
} from "@clc/core/features/catalog/logic";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { reportsClient } from "#/lib/api/reports";
import type { MarketLocation } from "#/features/home/ui/market-data";

export type MarketReportLocation = MarketLocation & { kind: "post"; reportId: string };

export function useMarketMapReports({
  filter = EMPTY_CATALOG_FILTER,
  bounds,
  creditablePools,
  enabled,
  facets,
}: {
  filter?: CatalogFilter;
  bounds: readonly MarketBoundingBox[];
  creditablePools?: readonly VoucherRef[];
  enabled: boolean;
  facets: boolean;
}) {
  const query = useQuery({
    ...reportMapQueryOptions(reportsClient, { filter, bounds, creditablePools, facets }),
    enabled,
  });

  const reports = useMemo<MarketReportLocation[]>(() => {
    if (!enabled) return [];
    return (query.data?.reports ?? []).flatMap((report) =>
      report.lat === null || report.lng === null
        ? []
        : [
            {
              id: `market:post:${report.id}`,
              reportId: report.id,
              name: report.title,
              kind: "post" as const,
              markerIcon: report.markerIcon,
              markerColor: report.markerColor,
              lat: report.lat,
              lng: report.lng,
              locationName: report.locationName,
            },
          ],
    );
  }, [enabled, query.data?.reports]);

  return {
    reports,
    tagFacets: enabled ? (query.data?.tagFacets ?? []) : [],
    error: enabled ? query.error : null,
    retry: useCallback(() => void query.refetch(), [query]),
    retrying: enabled && query.isFetching,
  } as const;
}
