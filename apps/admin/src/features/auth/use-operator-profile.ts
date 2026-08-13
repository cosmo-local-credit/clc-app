import { useQuery } from "@tanstack/react-query";

import { clcApi } from "#/lib/api";

/**
 * The signed-in operator's profile (name, email, …).
 *
 * Hung off `["clc", …]` so `clearProtectedQueries` drops it on sign-out and a
 * later operator cannot inherit the previous name from the cache.
 */
const operatorProfileQueryKey = ["clc", "auth", "profile"] as const;

export function useOperatorProfile() {
  return useQuery({
    queryKey: operatorProfileQueryKey,
    queryFn: () => clcApi.auth.getProfile(),
    staleTime: 60_000,
  });
}
