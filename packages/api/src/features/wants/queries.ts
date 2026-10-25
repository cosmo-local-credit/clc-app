import { infiniteQueryOptions, mutationOptions, queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { marketplaceKeys } from "../marketplace/queries";
import { resourceLimitKeys } from "../resource-limits/queries";
import type { WantWrite } from "@clc/core/features/wants/logic";
import type { WantsClient, WantsParams } from "./client";

export const wantKeys = {
  all: ["clc", "wants"] as const,
  list: (params: Omit<WantsParams, "cursor" | "next">) => ["clc", "wants", "list", params] as const,
  detail: (id: string) => ["clc", "wants", "detail", id] as const,
  mine: (address: string) => ["clc", "wants", "mine", address.toLowerCase()] as const,
  pool: (address: string) => ["clc", "wants", "pool", address.toLowerCase()] as const,
  creatorVouchers: (id: string) => ["clc", "wants", "detail", id, "creator-vouchers"] as const,
  creatorPools: (id: string) => ["clc", "wants", "detail", id, "creator-pools"] as const,
};

export function wantsInfiniteQueryOptions(
  client: WantsClient,
  params: Omit<WantsParams, "cursor" | "next">,
) {
  return infiniteQueryOptions({
    queryKey: wantKeys.list(params),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.list({ ...params, cursor: pageParam, next: true }, signal),
    getNextPageParam: (page) =>
      page.wants.length >= (params.perPage ?? 20) && page.last > 0 ? page.last : undefined,
  });
}

export function myWantsInfiniteQueryOptions(client: WantsClient, address: string) {
  return infiniteQueryOptions({
    queryKey: wantKeys.mine(address),
    enabled: !!address,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) => client.mine({ perPage: 20, cursor: pageParam }, signal),
    getNextPageParam: (page) => (page.wants.length >= 20 && page.last > 0 ? page.last : undefined),
  });
}

export function poolWantsInfiniteQueryOptions(client: WantsClient, address: string) {
  return infiniteQueryOptions({
    queryKey: wantKeys.pool(address),
    enabled: !!address,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.pool(address, { perPage: 20, cursor: pageParam }, signal),
    getNextPageParam: (page) => (page.wants.length >= 20 && page.last > 0 ? page.last : undefined),
  });
}

export function wantDetailQueryOptions(client: WantsClient, id: string) {
  return queryOptions({
    queryKey: wantKeys.detail(id),
    queryFn: ({ signal }) => client.detail(id, signal),
    enabled: !!id,
  });
}

export function wantCreatorVouchersInfiniteQueryOptions(client: WantsClient, id: string) {
  const perPage = 3;
  return infiniteQueryOptions({
    queryKey: wantKeys.creatorVouchers(id),
    enabled: !!id,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.creatorVouchers(id, { perPage, cursor: pageParam, next: true }, signal),
    getNextPageParam: (page) =>
      page.vouchers.length >= perPage && page.last > 0 ? page.last : undefined,
  });
}

export function wantCreatorPoolsInfiniteQueryOptions(client: WantsClient, id: string) {
  const perPage = 3;
  return infiniteQueryOptions({
    queryKey: wantKeys.creatorPools(id),
    enabled: !!id,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.creatorPools(id, { perPage, cursor: pageParam, next: true }, signal),
    getNextPageParam: (page) =>
      page.pools.length >= perPage && page.last > 0 ? page.last : undefined,
  });
}

export function myWantQueryOptions(client: WantsClient, address: string, id: string) {
  return queryOptions({
    queryKey: [...wantKeys.mine(address), "detail", id] as const,
    enabled: !!address && !!id,
    queryFn: async ({ signal }) => {
      let cursor: number | undefined;
      const seen = new Set<number>();
      do {
        const page = await client.mine({ perPage: 50, cursor }, signal);
        const want = page.wants.find((candidate) => candidate.id === id);
        if (want) return want;
        if (page.wants.length < 50 || page.last === 0 || seen.has(page.last)) break;
        seen.add(page.last);
        cursor = page.last;
      } while (cursor);
      throw new Error("Want not found");
    },
  });
}

export function saveWantMutationOptions(
  client: WantsClient,
  queryClient: QueryClient,
  id?: string,
  reopen = false,
) {
  return mutationOptions({
    mutationFn: (input: WantWrite) =>
      id ? (reopen ? client.reopen(id, input) : client.update(id, input)) : client.create(input),
    onSuccess: async (want) => {
      // Owner writes may return a scheduled/closed row and editing permission
      // metadata that the public detail endpoint deliberately withholds. Never
      // seed that response into the public cache; make the public route prove
      // current lifecycle visibility and resolve only explicitly shared contact.
      queryClient.removeQueries({ queryKey: wantKeys.detail(want.id) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: wantKeys.all }),
        queryClient.invalidateQueries({ queryKey: marketplaceKeys.all }),
        queryClient.invalidateQueries({ queryKey: resourceLimitKeys.all }),
      ]);
    },
  });
}
