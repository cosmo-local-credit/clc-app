import { useQuery } from "@tanstack/react-query";

import { profileQueryOptions } from "@clc/api/features/auth/queries";
import { clcApi } from "#/lib/api";

/**
 * The signed-in operator's profile (name, email, …).
 *
 * No address is passed: this console has no wallet, so there is one profile — the
 * cookie's. The shared key hangs off `["clc", …]`, which is what
 * `clearProtectedQueries` sweeps on sign-out and session expiry, so a later
 * operator cannot inherit the previous name from the cache.
 */
export function useOperatorProfile() {
  return useQuery(profileQueryOptions(clcApi.auth));
}
