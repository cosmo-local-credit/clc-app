import { retryTransientBackendRead } from "@clc/api/client/errors";
import { publicProfileQueryOptions } from "@clc/api/features/public-profiles/queries";
import { useQuery } from "@tanstack/react-query";
import { publicProfilesClient } from "#/lib/api/public-profiles";

export function usePublicProfile(address: string) {
  const query = useQuery(publicProfileQueryOptions(publicProfilesClient, address));
  return { query, profile: retainedProfileData(query) };
}

export function retainedProfileData<T>({ data, error }: { data: T; error: unknown }) {
  return error && !retryTransientBackendRead(0, error) ? undefined : data;
}
