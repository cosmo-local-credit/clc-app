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
  marketMapFacetsResponseSchema,
  marketMapPointsResponseSchema,
  type MarketMapFacetsResponse,
  type MarketMapKind,
  type MarketMapPointsResponse,
} from "@clc/core/features/market-map/logic";
import type { z } from "zod";

import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { CreditScope } from "../credit-router/client";
import type { HttpClient } from "../../client/http-client";
import { appendMarketBounds } from "../../lib/catalog-bounds";

/** What selects the map's points. The viewport is not part of it. */
export type MarketMapParams = {
  kinds: readonly MarketMapKind[];
  filter: Pick<CatalogFilter, "term" | "tags" | "tagMatch">;
  creditablePools?: readonly { chainId: number; address: string }[];
  /**
   * The server-resolved Credit filter (`creditDepth`), for a signed-in wallet.
   * It replaces `creditablePools`; the two cannot be sent together.
   */
  credit?: CreditScope;
  postTiming?: PostTiming;
  postVouchers?: readonly VoucherRef[];
  postVoucherMatch?: "any" | "all";
  postPools?: readonly VoucherRef[];
  postPoolMatch?: "any" | "all";
};

/** Facets count one viewport, so they carry its exact boxes. */
export type MarketMapFacetsParams = MarketMapParams & { bounds: readonly MarketBoundingBox[] };

export type MarketMapClient = ReturnType<typeof createMarketMapClient>;

export function createMarketMapClient(http: HttpClient) {
  async function read<T extends z.ZodType>(
    path: string,
    query: URLSearchParams,
    schema: T,
    signal: AbortSignal | undefined,
  ): Promise<z.infer<T>> {
    const parsed = schema.safeParse(
      await http.request<unknown>(`/api/v2/market-map/${path}?${query}`, {
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
  }

  return {
    async points(params: MarketMapParams, signal?: AbortSignal): Promise<MarketMapPointsResponse> {
      return read("points", filterQuery(params), marketMapPointsResponseSchema, signal);
    },
    async facets(
      params: MarketMapFacetsParams,
      signal?: AbortSignal,
    ): Promise<MarketMapFacetsResponse> {
      const query = filterQuery(params);
      appendMarketBounds(query, params.bounds);
      return read("facets", query, marketMapFacetsResponseSchema, signal);
    },
  };
}

function filterQuery(params: MarketMapParams): URLSearchParams {
  const query = new URLSearchParams();
  for (const kind of params.kinds) query.append("kinds", kind);
  if (params.filter.term) query.set("q", params.filter.term);
  for (const tag of params.filter.tags) query.append("tags", tag);
  if (params.filter.tags.length > 1 && params.filter.tagMatch === "all") {
    query.set("tagMatch", "all");
  }
  if (params.credit && params.creditablePools) {
    throw new Error("creditDepth replaces creditablePools; send one or the other.");
  }
  for (const pool of params.creditablePools ?? []) {
    query.append("creditablePools", `${pool.chainId}:${pool.address}`);
  }
  if (params.credit) query.set("creditDepth", String(params.credit.depth));
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
  return query;
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
