import { publicProfileQueryOptions } from "@clc/api/features/public-profiles/queries";
import { useQuery } from "@tanstack/react-query";
import { publicProfilesClient } from "#/lib/api/public-profiles";

export function usePublicProfile(address: string) {
  return useQuery(publicProfileQueryOptions(publicProfilesClient, address));
}
