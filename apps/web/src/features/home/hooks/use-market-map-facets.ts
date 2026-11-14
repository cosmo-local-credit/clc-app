import { marketMapFacetsQueryOptions } from "@clc/api/features/market-map/queries";
import type { ReportPoolFacet, ReportVoucherFacet } from "@clc/api/features/reports/client";
import type { CatalogFilter, VoucherRef } from "@clc/core/features/catalog/logic";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import { DEFAULT_POST_TIMING, type PostTiming } from "@clc/core/features/reports/logic";
import type { MarketMapKind } from "@clc/core/features/market-map/logic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { CreditScope } from "@clc/api/features/credit-router/client";
import { marketMapClient } from "#/lib/api/market-map";

type UseMarketMapFacetsOptions = {
  /** The exact visible boxes; facets count what the viewer can see. */
  bounds: readonly MarketBoundingBox[];
  kinds: readonly MarketMapKind[];
  filter: Pick<CatalogFilter, "term" | "tags" | "tagMatch">;
  creditablePools?: readonly { chainId: number; address: string }[];
  credit?: CreditScope;
  postTiming?: PostTiming;
  postVouchers?: readonly VoucherRef[];
  postVoucherMatch?: "any" | "all";
  postPools?: readonly VoucherRef[];
  postPoolMatch?: "any" | "all";
  enabled: boolean;
};

/** Filter-sheet facets for the visible viewport, fetched once filters have been opened. */
export function useMarketMapFacets(options: UseMarketMapFacetsOptions) {
  const query = useQuery({
    ...marketMapFacetsQueryOptions(marketMapClient, {
      bounds: options.bounds,
      kinds: options.kinds,
      filter: options.filter,
      creditablePools: options.creditablePools,
      credit: options.credit,
      postTiming: options.postTiming ?? DEFAULT_POST_TIMING,
      postVouchers: options.postVouchers,
      postVoucherMatch: options.postVoucherMatch,
      postPools: options.postPools,
      postPoolMatch: options.postPoolMatch,
    }),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
  });
  const data = options.enabled ? query.data : undefined;
  return {
    tagFacets: data?.tagFacets ?? [],
    postVoucherFacets: (data?.postVoucherFacets ?? []) as ReportVoucherFacet[],
    postPoolFacets: (data?.postPoolFacets ?? []) as ReportPoolFacet[],
  };
}
