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
  webAuthnCredentials: (address: string) =>
    ["clc", "auth", "webauthn-credentials", address.toLowerCase()] as const,
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

/**
 * The passkeys clc-core has mapped to the signed-in wallet.
 *
 * This is the account's record, not the device's: a passkey made on another
 * phone leaves nothing in local storage, so linked status must come from here.
 * clc-core scopes the answer to the session's address; the key carries the
 * address too, so a wallet switch never reads the previous account's entry, and
 * it sits under `["clc", …]` so the identity-boundary sweep drops it.
 *
 * Like `profileQueryOptions`, `enabled` is the caller's: the request is only
 * meaningful once a session for this exact address exists.
 */
export function webAuthnCredentialsQueryOptions(auth: AuthClient, address: string) {
  return queryOptions({
    queryKey: authKeys.webAuthnCredentials(address),
    queryFn: () => auth.getWebAuthnCredentials(),
    staleTime: 30_000,
  });
}
