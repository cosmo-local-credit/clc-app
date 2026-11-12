import {
  marketplaceResultSchema,
  type MarketplaceKind,
} from "@clc/core/features/marketplace/logic";
import { z } from "zod";
import { BackendApiError, NO_HTTP_STATUS } from "../../client/errors";
import type { HttpClient } from "../../client/http-client";
import type { MarketBoundingBox } from "@clc/core/features/catalog/nearby";
import { type VoucherRef, serializeVoucherRef } from "@clc/core/features/catalog/logic";
import type { PostTiming } from "@clc/core/features/reports/logic";
import { appendMarketBounds } from "../../lib/catalog-bounds";

const tagFacetSchema = z.object({ tag: z.string(), count: z.number().int().nonnegative() });
const marketplacePageSchema = z.object({
  results: z.array(marketplaceResultSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative().optional(),
  tagFacets: z.array(tagFacetSchema).optional(),
});

export type MarketplaceParams = {
  cursor?: string;
  perPage?: number;
  q?: string;
  kinds?: readonly MarketplaceKind[];
  tags?: readonly string[];
  tagMatch?: "any" | "all";
  facets?: boolean;
  nearby?: boolean;
  sort?: "nearest";
  bounds?: readonly MarketBoundingBox[];
  pools?: readonly { chainId: number; address: string }[];
  postTiming?: PostTiming;
  postVouchers?: readonly VoucherRef[];
  postVoucherMatch?: "any" | "all";
  postPools?: readonly VoucherRef[];
  postPoolMatch?: "any" | "all";
};

export type MarketplacePage = z.infer<typeof marketplacePageSchema>;
export type MarketplaceClient = ReturnType<typeof createMarketplaceClient>;

export function createMarketplaceClient(http: HttpClient) {
  return {
    async list(params: MarketplaceParams, signal?: AbortSignal): Promise<MarketplacePage> {
      const query = new URLSearchParams({ perPage: String(params.perPage ?? 20) });
      if (params.cursor) query.set("cursor", params.cursor);
      if (params.q?.trim()) query.set("q", params.q.trim());
      if (params.kinds?.length) query.set("kinds", params.kinds.join(","));
      if (params.tags?.length) query.set("tags", params.tags.join(","));
      if (params.tagMatch === "all" && (params.tags?.length ?? 0) > 1) query.set("tagMatch", "all");
      if (params.facets) query.set("facets", "true");
      if (params.nearby) query.set("nearby", "true");
      if (params.sort) query.set("sort", params.sort);
      appendMarketBounds(query, params.bounds);
      if (params.pools?.length)
        query.set("pools", params.pools.map((pool) => `${pool.chainId}:${pool.address}`).join(","));
      if (params.postTiming) query.set("postTiming", params.postTiming);
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
      const parsed = marketplacePageSchema.safeParse(
        await http.request<unknown>(`/api/v2/marketplace?${query}`, {
          method: "GET",
          cache: "no-store",
          credentials: params.nearby || params.sort ? "include" : "omit",
          signal,
        }),
      );
      if (!parsed.success)
        throw new BackendApiError(NO_HTTP_STATUS, "Invalid marketplace response", undefined, {
          kind: "protocol",
        });
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
  if (values?.length) query.set(key, values.map(serializeVoucherRef).join(","));
  if ((values?.length ?? 0) > 1 && match === "all") query.set(matchKey, "all");
}
