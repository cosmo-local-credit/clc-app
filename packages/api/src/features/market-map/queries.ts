import { backendRetryDelayMs, BackendApiError } from "../../client/errors";
import { queryOptions } from "@tanstack/react-query";
import type { MarketMapClient, MarketMapFacetsParams, MarketMapParams } from "./client";

function filterIdentity(params: MarketMapParams) {
  return {
    kinds: [...params.kinds],
    filter: {
      term: params.filter.term,
      tags: [...params.filter.tags],
      tagMatch: params.filter.tagMatch,
    },
    creditablePools: params.creditablePools?.map(
      (pool) => `${pool.chainId}:${pool.address.toLowerCase()}`,
    ),
    postTiming: params.postTiming ?? "future",
    postVouchers: params.postVouchers?.map(
      (voucher) => `${voucher.chainId}:${voucher.address.toLowerCase()}`,
    ),
    postVoucherMatch: params.postVoucherMatch ?? "any",
    postPools: params.postPools?.map((pool) => `${pool.chainId}:${pool.address.toLowerCase()}`),
    postPoolMatch: params.postPoolMatch ?? "any",
  };
}

export const marketMapKeys = {
  all: ["clc", "market-map"] as const,
  /** Filters only: panning and zooming reuse one entry. */
  points: (params: MarketMapParams) =>
    ["clc", "market-map", "points", filterIdentity(params)] as const,
  facets: (params: MarketMapFacetsParams) =>
    [
      "clc",
      "market-map",
      "facets",
      {
        ...filterIdentity(params),
        bounds: params.bounds.map((box) => [box.minLng, box.minLat, box.maxLng, box.maxLat]),
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

const DISCOVERY_RETRY = {
  retry: (failureCount: number, error: Error) =>
    failureCount < 3 && isRetryableDiscoveryError(error),
  retryDelay: (attempt: number, error: Error) => discoveryRetryDelayMs(attempt, error),
};

export function marketMapPointsQueryOptions(client: MarketMapClient, params: MarketMapParams) {
  return queryOptions({
    queryKey: marketMapKeys.points(params),
    queryFn: ({ signal }) => client.points(params, signal),
    staleTime: 60_000,
    ...DISCOVERY_RETRY,
  });
}

export function marketMapFacetsQueryOptions(
  client: MarketMapClient,
  params: MarketMapFacetsParams,
) {
  return queryOptions({
    queryKey: marketMapKeys.facets(params),
    queryFn: ({ signal }) => client.facets(params, signal),
    ...DISCOVERY_RETRY,
  });
}
