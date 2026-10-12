import { infiniteQueryOptions } from "@tanstack/react-query";
import type { MarketplaceClient, MarketplaceParams } from "./client";

export const marketplaceKeys = {
  all: ["clc", "marketplace"] as const,
  list: (params: Omit<MarketplaceParams, "cursor"> & { scope?: string }) =>
    [
      "clc",
      "marketplace",
      "list",
      {
        ...params,
        q: params.q?.trim() ?? "",
        tags: [...(params.tags ?? [])],
        kinds: [...(params.kinds ?? [])],
        pools: params.pools?.map((pool) => `${pool.chainId}:${pool.address.toLowerCase()}`),
      },
    ] as const,
};

export function marketplaceInfiniteQueryOptions(
  client: MarketplaceClient,
  params: Omit<MarketplaceParams, "cursor"> & { scope?: string },
) {
  const { scope: _scope, ...request } = params;
  return infiniteQueryOptions({
    queryKey: marketplaceKeys.list(params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => client.list({ ...request, cursor: pageParam }, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
