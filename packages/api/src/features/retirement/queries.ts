import { queryOptions } from "@tanstack/react-query";
import type { AdminRetirementListParams, RetirementClient, RetirementResourceType } from "./client";

export const retirementKeys = {
  all: ["clc", "retirement"] as const,
  preview: (type: RetirementResourceType, address: string, viewer: string) =>
    ["clc", "retirement", "preview", viewer.toLowerCase(), type, address.toLowerCase()] as const,
  mine: (viewer: string) => ["clc", "retirement", "mine", viewer.toLowerCase()] as const,
  resource: (type: RetirementResourceType, address: string, viewer: string) =>
    ["clc", "retirement", "resource", viewer.toLowerCase(), type, address.toLowerCase()] as const,
  adminList: (params: AdminRetirementListParams) =>
    ["clc", "retirement", "admin", "list", params] as const,
  adminRequest: (id: number) => ["clc", "retirement", "admin", "request", id] as const,
  adminResource: (type: RetirementResourceType, address: string) =>
    ["clc", "retirement", "admin", "resource", type, address.toLowerCase()] as const,
};

const refreshPolicy = { staleTime: 0, refetchInterval: 30_000, retry: false } as const;

export function retirementPreviewQueryOptions(
  client: RetirementClient,
  type: RetirementResourceType,
  address: string,
  viewer: string,
) {
  return queryOptions({
    queryKey: retirementKeys.preview(type, address, viewer),
    queryFn: ({ signal }) => client.preview(type, address, signal),
    enabled: !!address && !!viewer,
    staleTime: 0,
    retry: false,
  });
}

export function resourceRetirementRequestsQueryOptions(
  client: RetirementClient,
  type: RetirementResourceType,
  address: string,
  viewer: string,
) {
  return queryOptions({
    queryKey: retirementKeys.resource(type, address, viewer),
    queryFn: ({ signal }) => client.listResource(type, address, signal),
    enabled: !!address && !!viewer,
    ...refreshPolicy,
  });
}

export function myRetirementRequestsQueryOptions(client: RetirementClient, viewer: string) {
  return queryOptions({
    queryKey: retirementKeys.mine(viewer),
    queryFn: ({ signal }) => client.listMine(signal),
    enabled: !!viewer,
    ...refreshPolicy,
  });
}

export function adminRetirementRequestsQueryOptions(
  client: RetirementClient,
  params: AdminRetirementListParams = {},
) {
  return queryOptions({
    queryKey: retirementKeys.adminList(params),
    queryFn: ({ signal }) => client.listAdmin(params, signal),
    ...refreshPolicy,
  });
}

export function adminRetirementRequestQueryOptions(client: RetirementClient, id: number) {
  return queryOptions({
    queryKey: retirementKeys.adminRequest(id),
    queryFn: ({ signal }) => client.getAdminRequest(id, signal),
    enabled: Number.isSafeInteger(id) && id > 0,
    ...refreshPolicy,
  });
}

export function adminResourceRetirementHistoryQueryOptions(
  client: RetirementClient,
  type: RetirementResourceType,
  address: string,
) {
  return queryOptions({
    queryKey: retirementKeys.adminResource(type, address),
    queryFn: ({ signal }) => client.adminResourceHistory(type, address, signal),
    enabled: !!address,
    ...refreshPolicy,
  });
}
