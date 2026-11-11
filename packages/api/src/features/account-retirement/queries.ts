import { queryOptions } from "@tanstack/react-query";

import type { AccountRetirementClient } from "./client";

export const accountRetirementKeys = {
  all: ["clc", "account-retirement"] as const,
  /** Private to the signed-in wallet: a different account must never read this cache. */
  preview: (viewer: string) =>
    ["clc", "account-retirement", "preview", viewer.toLowerCase()] as const,
  admin: (address: string) =>
    ["clc", "account-retirement", "admin", address.toLowerCase()] as const,
  moderation: (address: string) =>
    ["clc", "account-retirement", "moderation", address.toLowerCase()] as const,
};

export function accountRetirementPreviewQueryOptions(
  client: AccountRetirementClient,
  viewer: string,
) {
  return queryOptions({
    queryKey: accountRetirementKeys.preview(viewer),
    queryFn: ({ signal }) => client.preview(signal),
    enabled: !!viewer,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function adminAccountRetirementQueryOptions(
  client: AccountRetirementClient,
  address: string,
) {
  return queryOptions({
    queryKey: accountRetirementKeys.admin(address),
    queryFn: ({ signal }) => client.adminGet(address, signal),
    enabled: !!address,
    staleTime: 0,
    retry: false,
  });
}

export function moderationHistoryQueryOptions(client: AccountRetirementClient, address: string) {
  return queryOptions({
    queryKey: accountRetirementKeys.moderation(address),
    queryFn: ({ signal }) => client.moderationHistory(address, signal),
    enabled: !!address,
    staleTime: 0,
    retry: false,
  });
}
