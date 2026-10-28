import { backendRetryDelayMs, BackendApiError } from "../../client/errors";
import { canonicalMarketMapZoom } from "@clc/core/features/market-map/logic";
import { queryOptions } from "@tanstack/react-query";
import type { MarketMapClient, MarketMapParams } from "./client";

export const marketMapKeys = {
  all: ["clc", "market-map"] as const,
  list: (params: MarketMapParams) =>
    [
      "clc",
      "market-map",
      {
        ...params,
        zoom: canonicalMarketMapZoom(params.zoom),
        bounds: params.bounds.map((box) => [box.minLng, box.minLat, box.maxLng, box.maxLat]),
        kinds: [...params.kinds],
        filter: {
          term: params.filter.term,
          tags: [...params.filter.tags],
          tagMatch: params.filter.tagMatch,
        },
        creditablePools: params.creditablePools?.map(
          (pool) => `${pool.chainId}:${pool.address.toLowerCase()}`,
        ),
      },
    ] as const,
};

export function isRetryableDiscoveryError(error: unknown): boolean {
  return (
    error instanceof BackendApiError &&
    (error.kind === "network" || error.kind === "server" || error.kind === "rate-limited")
  );
}

export function discoveryRetryDelayMs(
  attempt: number,
  error: unknown,
  random: () => number = Math.random,
): number {
  return backendRetryDelayMs(error, attempt) + Math.floor(random() * 250);
}

export function marketMapQueryOptions(client: MarketMapClient, params: MarketMapParams) {
  return queryOptions({
    queryKey: marketMapKeys.list(params),
    queryFn: ({ signal }) => client.list(params, signal),
    retry: (failureCount, error) => failureCount < 3 && isRetryableDiscoveryError(error),
    retryDelay: (attempt, error) => discoveryRetryDelayMs(attempt, error),
  });
}
