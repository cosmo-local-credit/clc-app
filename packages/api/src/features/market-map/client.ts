import type { CatalogFilter } from "@clc/core/features/catalog/logic";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
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
