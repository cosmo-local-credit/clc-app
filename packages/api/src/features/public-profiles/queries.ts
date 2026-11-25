import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { ProfileSection } from "@clc/core/features/public-profiles/logic";
import type { ProfileResourceKind, PublicProfilesClient } from "./client";

export const publicProfileKeys = {
  all: ["clc", "public-profiles"] as const,
  detail: (address: string) => ["clc", "public-profiles", address.toLowerCase()] as const,
  details: (address: string, viewer: string) =>
    [
      "clc",
      "public-profiles",
      address.toLowerCase(),
      "private-details",
      viewer.toLowerCase(),
    ] as const,
  resource: (kind: ProfileResourceKind, id: string) =>
    ["clc", "public-profiles", "resource", kind, id.toLowerCase()] as const,
};

export function publicProfileQueryOptions(client: PublicProfilesClient, address: string) {
  return queryOptions({
    queryKey: publicProfileKeys.detail(address),
    queryFn: ({ signal }) => client.detail(address, signal),
    staleTime: 0,
    retry: false,
  });
}

export function profileDetailsQueryOptions(
  client: PublicProfilesClient,
  address: string,
  viewer?: string,
) {
  return queryOptions({
    queryKey: publicProfileKeys.details(address, viewer ?? "none"),
    queryFn: ({ signal }) => client.details(address, signal),
    enabled: Boolean(viewer),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function profileResourcesQueryOptions(
  client: PublicProfilesClient,
  address: string,
  section: ProfileSection,
) {
  return infiniteQueryOptions({
    queryKey: [...publicProfileKeys.detail(address), "resources", section] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => client.resources(address, section, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
    retry: false,
  });
}

export function resourceProfilesQueryOptions(
  client: PublicProfilesClient,
  kind: ProfileResourceKind,
  id: string,
) {
  return queryOptions({
    queryKey: publicProfileKeys.resource(kind, id),
    queryFn: ({ signal }) => client.forResource(kind, id, signal),
    staleTime: 0,
    retry: false,
  });
}
