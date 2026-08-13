/**
 * Canonical query identity for the signed-in account's profile.
 *
 * Both apps read the same `GET /auth/profile`, and both had hand-rolled it — with
 * keys in unrelated namespaces (`["auth", …]` in apps/web, `["clc", …]` in
 * apps/admin), so the same resource occupied two cache trees. Every other shared
 * resource has a factory here; this one was the gap.
 *
 * The address is part of the key because apps/web holds a wallet and can switch
 * accounts without reloading, so one operator's profile must not be served to the
 * next. apps/admin has no wallet and passes nothing, taking the `current` slot.
 *
 * `["clc", …]` matters beyond tidiness: the admin console clears everything under
 * that prefix on sign-out and session expiry, so a profile keyed anywhere else
 * would survive an identity change.
 */

import { queryOptions } from "@tanstack/react-query";

import type { AuthClient } from "./client";

export const authKeys = {
  all: ["clc", "auth"] as const,
  profile: (address?: string) =>
    ["clc", "auth", "profile", address?.toLowerCase() ?? "current"] as const,
} as const;

/**
 * Base options for the profile read.
 *
 * Deliberately does not set `enabled` or `retry`: whether a profile can be
 * requested at all is an app-level question — apps/web must wait for a connected
 * wallet — so callers spread this and add their own.
 */
export function profileQueryOptions(auth: AuthClient, address?: string) {
  return queryOptions({
    queryKey: authKeys.profile(address),
    queryFn: () => auth.getProfile(),
    staleTime: 60_000,
  });
}
