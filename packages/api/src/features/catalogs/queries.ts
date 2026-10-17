import { resourceLimitKeys } from "../resource-limits/queries";
import type { CatalogKind, CatalogWrite } from "@clc/core/features/catalogs/logic";
import { infiniteQueryOptions, mutationOptions, queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { CatalogsClient } from "./client";

export const catalogKeys = {
  all: ["clc", "catalogs"] as const,
  list: (
    input:
      | {
          scope?: string;
          nearby?: boolean;
          q?: string;
          tags?: readonly string[];
          tagMatch?: "any" | "all";
          pools?: readonly { chainId: number; address: string }[];
        }
      | string = {},
  ) => {
    const params = typeof input === "string" ? { scope: input, nearby: false } : input;
    return [
      "clc",
      "catalogs",
      "list",
      params.scope ?? "public",
      params.nearby === true,
      params.q?.trim() ?? "",
      [...(params.tags ?? [])],
      params.tagMatch ?? "any",
      params.pools?.map((pool) => `${pool.chainId}:${pool.address.toLowerCase()}`),
    ] as const;
  },
  mine: (address: string) => ["clc", "catalogs", "mine", address.toLowerCase()] as const,
  detail: (id: string) => ["clc", "catalogs", "detail", id] as const,
  members: (id: string, kind: CatalogKind) => ["clc", "catalogs", "members", id, kind] as const,
  membership: (address: string, id: string, kind: CatalogKind, resourceId: string) =>
    ["clc", "catalogs", "membership", address.toLowerCase(), id, kind, resourceId] as const,
};

export function catalogsInfiniteQueryOptions(
  client: CatalogsClient,
  input:
    | {
        scope?: string;
        nearby?: boolean;
        q?: string;
        tags?: readonly string[];
        tagMatch?: "any" | "all";
        pools?: readonly { chainId: number; address: string }[];
      }
    | string = {},
) {
  const params = typeof input === "string" ? { scope: input, nearby: false } : input;
  return infiniteQueryOptions({
    queryKey: catalogKeys.list(params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.list(
        {
          cursor: pageParam,
          nearby: params.nearby === true,
          q: params.q,
          tags: params.tags,
          tagMatch: params.tagMatch,
          pools: params.pools,
          facets: true,
        },
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export function myCatalogsQueryOptions(client: CatalogsClient, address: string) {
  return queryOptions({
    queryKey: catalogKeys.mine(address),
    queryFn: ({ signal }) => client.mine(signal),
    enabled: !!address,
  });
}
export function catalogDetailQueryOptions(client: CatalogsClient, id: string) {
  return queryOptions({
    queryKey: catalogKeys.detail(id),
    queryFn: ({ signal }) => client.detail(id, signal),
  });
}
export function catalogMembersQueryOptions(client: CatalogsClient, id: string, kind: CatalogKind) {
  return infiniteQueryOptions({
    queryKey: catalogKeys.members(id, kind),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => client.members(id, kind, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export function catalogMembershipQueryOptions(
  client: CatalogsClient,
  address: string,
  id: string,
  kind: CatalogKind,
  resourceId: string,
) {
  return queryOptions({
    queryKey: catalogKeys.membership(address, id, kind, resourceId),
    queryFn: ({ signal }) => client.membership(id, kind, resourceId, signal),
    enabled: !!address && !!id,
  });
}

/** Keep detail seeded while refreshing every list/count/member affected by a write. */
export function saveCatalogMutationOptions(
  client: CatalogsClient,
  queryClient: QueryClient,
  id?: string,
) {
  return mutationOptions({
    mutationKey: [...catalogKeys.all, "save"],
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceLimitKeys.all }),
    mutationFn: (input: CatalogWrite) => (id ? client.update(id, input) : client.create(input)),
    onSuccess: async (catalog) => {
      queryClient.setQueryData(catalogKeys.detail(catalog.id), catalog);
      await queryClient.invalidateQueries({
        queryKey: catalogKeys.all,
        predicate: (query) => query.queryKey[2] !== "detail",
      });
    },
  });
}
export function catalogMemberMutationOptions(
  client: CatalogsClient,
  queryClient: QueryClient,
  address: string,
) {
  return mutationOptions({
    mutationKey: [...catalogKeys.all, "member", address.toLowerCase()],
    mutationFn: (input: {
      catalogId: string;
      kind: CatalogKind;
      resourceId: string;
      added: boolean;
    }) => client.setMember(input.catalogId, input.kind, input.resourceId, input.added),
    onSuccess: async (state, input) => {
      queryClient.setQueryData(
        catalogKeys.membership(address, input.catalogId, input.kind, input.resourceId),
        state,
      );
      await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}
