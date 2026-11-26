import { queryOptions } from "@tanstack/react-query";
import { transientBackendReadQueryPolicy } from "../../client/errors";
import type { RegionsClient } from "./client";

export const regionKeys = {
  admin: (viewer: string) => ["clc", "admin", "regions", viewer.toLowerCase()] as const,
  mine: (viewer: string) => ["clc", "my-regions", viewer.toLowerCase()] as const,
  countries: (viewer: string) => [...regionKeys.admin(viewer), "countries"] as const,
  country: (viewer: string, code: string) => [...regionKeys.countries(viewer), code] as const,
};

const privateRead = { ...transientBackendReadQueryPolicy, staleTime: 0, gcTime: 0 };

export function adminRegionsQueryOptions(client: RegionsClient, viewer: string) {
  return queryOptions({
    queryKey: regionKeys.admin(viewer),
    queryFn: ({ signal }) => client.list(signal),
    enabled: Boolean(viewer),
    ...privateRead,
  });
}

export function myRegionsQueryOptions(client: RegionsClient, viewer: string) {
  return queryOptions({
    queryKey: regionKeys.mine(viewer),
    queryFn: ({ signal }) => client.myRegions(signal),
    enabled: Boolean(viewer),
    ...privateRead,
  });
}

export function regionCountriesQueryOptions(client: RegionsClient, viewer: string) {
  return queryOptions({
    queryKey: regionKeys.countries(viewer),
    queryFn: ({ signal }) => client.countries(signal),
    enabled: Boolean(viewer),
    ...privateRead,
    staleTime: 5 * 60_000,
  });
}

export function regionCountryQueryOptions(client: RegionsClient, viewer: string, code: string) {
  return queryOptions({
    queryKey: regionKeys.country(viewer, code),
    queryFn: ({ signal }) => client.country(code, signal),
    enabled: Boolean(viewer) && Boolean(code),
    ...privateRead,
    staleTime: 5 * 60_000,
  });
}
