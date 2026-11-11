import {
  type CatalogFilter,
  type VoucherRef,
  serializeVoucherRef,
} from "@clc/core/features/catalog/logic";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import {
  DEFAULT_POST_TIMING,
  type PostTiming,
  serializePostTiming,
} from "@clc/core/features/reports/logic";
import {
  canonicalMarketMapZoom,
  marketMapResponseSchema,
  type MarketMapKind,
  type MarketMapResponse,
} from "@clc/core/features/market-map/logic";

import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";
import { appendMarketBounds } from "../../lib/catalog-bounds";

export type MarketMapParams = {
  bounds: readonly MarketBoundingBox[];
  zoom: number;
  kinds: readonly MarketMapKind[];
  filter: Pick<CatalogFilter, "term" | "tags" | "tagMatch">;
  facets?: boolean;
  creditablePools?: readonly { chainId: number; address: string }[];
  postTiming?: PostTiming;
  postVouchers?: readonly VoucherRef[];
  postVoucherMatch?: "any" | "all";
  postPools?: readonly VoucherRef[];
  postPoolMatch?: "any" | "all";
};

export type MarketMapClient = ReturnType<typeof createMarketMapClient>;

export function createMarketMapClient(http: HttpClient) {
  return {
    async list(params: MarketMapParams, signal?: AbortSignal): Promise<MarketMapResponse> {
      const query = new URLSearchParams();
      appendMarketBounds(query, params.bounds);
      query.set("zoom", String(canonicalMarketMapZoom(params.zoom)));
      for (const kind of params.kinds) query.append("kinds", kind);
      if (params.filter.term) query.set("q", params.filter.term);
      for (const tag of params.filter.tags) query.append("tags", tag);
      if (params.filter.tags.length > 1 && params.filter.tagMatch === "all") {
        query.set("tagMatch", "all");
      }
      if (params.facets) query.set("facets", "true");
      for (const pool of params.creditablePools ?? []) {
        query.append("creditablePools", `${pool.chainId}:${pool.address}`);
      }
      query.set(
        "postTiming",
        serializePostTiming(params.postTiming ?? DEFAULT_POST_TIMING) ?? DEFAULT_POST_TIMING,
      );
      appendPostRelationships(
        query,
        "postVouchers",
        "postVoucherMatch",
        params.postVouchers,
        params.postVoucherMatch,
      );
      appendPostRelationships(
        query,
        "postPools",
        "postPoolMatch",
        params.postPools,
        params.postPoolMatch,
      );

      const parsed = marketMapResponseSchema.safeParse(
        await http.request<unknown>(`/api/v2/market-map?${query}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          signal,
        }),
      );
      if (!parsed.success) {
        throw new BackendApiError(NO_HTTP_STATUS, "Invalid market map response", undefined, {
          kind: "protocol",
        });
      }
      return parsed.data;
    },
  };
}

function appendPostRelationships(
  query: URLSearchParams,
  key: "postVouchers" | "postPools",
  matchKey: "postVoucherMatch" | "postPoolMatch",
  values: readonly VoucherRef[] | undefined,
  match: "any" | "all" | undefined,
): void {
  for (const value of values ?? []) query.append(key, serializeVoucherRef(value));
  if ((values?.length ?? 0) > 1 && match === "all") query.set(matchKey, "all");
}
