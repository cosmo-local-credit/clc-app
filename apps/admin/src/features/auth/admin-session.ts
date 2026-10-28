/**
 * The admin session.
 *
 * Operators sign in with the same credentials they use on apps/web — a paper
 * wallet (SIWE over a private key) or a passkey — and the console is gated on the
 * role clc-core reports for that account. ADMIN and SUPERADMIN may enter;
 * role-management controls remain reserved for SUPERADMIN.
 *
 * This module is the only place the gate is decided. The route guard
 * (components/layout/auth-boundary.tsx), the shell and every surface read through
 * `useAdminSession`, so a change to the rule lands in one place.
 *
 * This is a UX gate only. clc-core enforces its administrative guard on every
 * /api/v2/admin endpoint and remains the security authority — what renders here
 * cannot grant access the backend withholds.
 */

import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BackendApiError } from "@clc/api/client/errors";
import type { SessionResult } from "@clc/api/features/auth/client";
import { isAdminRole } from "@clc/core/features/users/roles";
import { clcApi } from "#/lib/api";
import { useOperatorKeyStore } from "./operator-key";
import { errorMessage } from "#/lib/data-state";

/** Human-readable description of the roles that may use this console. */
export const ADMIN_ROLE_LABEL = "ADMIN or SUPERADMIN";

/** Reached through `AdminSession`, so consumers never need the name. */
type AdminOperator = {
  address: string;
  /** The raw role string from clc-core, shown as-is when access is refused. */
  role: string;
};

export type AdminSession =
  | { status: "loading" }
  | { status: "authenticated"; operator: AdminOperator }
  | { status: "unauthenticated" }
  | { status: "unauthorized"; operator: AdminOperator }
  | { status: "unavailable"; message: string };

export const adminSessionQueryKey = ["admin", "session"] as const;

/**
 * Everything fetched on an operator's behalf.
 *
 * `@clc/api` hangs every backend query off `["clc", …]`, so this one prefix covers
 * the whole protected surface — accounts, pools, vouchers, reports — and does not
 * need updating when a surface is added. The session query itself lives under
 * `["admin", …]` and is deliberately outside it, so signing out can clear the data
 * and still re-read the session.
 */
const PROTECTED_QUERY_PREFIX = ["clc"] as const;

/**
 * Drops everything fetched on an operator's behalf.
 *
 * Removed, not invalidated: `staleTime` is two minutes, so an invalidated cache
 * still serves the previous operator's rows to whoever comes next.
 *
 * Called on every identity boundary, not just explicit sign-out — a session that
 * expires and a different operator who signs in are the same hazard, and only one
 * of the three paths involves anyone pressing "Sign out".
 */
export function clearProtectedQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: PROTECTED_QUERY_PREFIX });
}

/**
 * Maps the session request's outcome to the five states.
 *
 * Pure and exported so every state can be tested without a query client.
 *
 * A signed-in operator without the role is `unauthorized`, not
 * `unauthenticated`: they hold a valid session, and telling them to sign in
 * again would be a dead end.
 *
 * A session whose role the backend does not report is `unavailable`, not
 * `unauthorized`. Older deployments omit the field, and denying a real administrator
 * with "not authorized" would send them looking for a permission problem that
 * does not exist.
 */
export function resolveSession(query: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: SessionResult | null | undefined;
}): AdminSession {
  if (query.isPending) return { status: "loading" };

  if (query.isError) {
    // /auth/session answers 204 rather than 401 when the cookie is missing or
    // expired, so an unauthenticated error is unexpected — handled anyway, since
    // showing "could not verify your session" to someone who simply needs to
    // sign in would hide the fix.
    if (query.error instanceof BackendApiError && query.error.kind === "unauthenticated") {
      return { status: "unauthenticated" };
    }
    return { status: "unavailable", message: errorMessage(query.error) };
  }

  if (!query.data) return { status: "unauthenticated" };

  const { address, role } = query.data;
  if (!role) {
    return { status: "unavailable", message: "The backend reported no role for this session." };
  }

  const operator: AdminOperator = { address, role };
  return isAdminRole(role)
    ? { status: "authenticated", operator }
    : { status: "unauthorized", operator };
}

export function useAdminSession(): AdminSession {
  const query = useQuery({
    queryKey: adminSessionQueryKey,
    queryFn: () => clcApi.auth.getSession(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // A failed session check is a state to render, not something to retry behind
    // the operator's back while the console sits on a spinner.
    retry: false,
  });

  return resolveSession(query);
}

/**
 * Ends the session.
 *
 * Reachable from the shell and from the `unauthorized` screen — an operator who
 * signed in with the wrong account must be able to get back to sign-in.
 */
export function useAdminSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clcApi.auth.logout(),
    onSettled: async () => {
      // Settled, not success: if the request failed the cookie may still be gone,
      // and a stale "authenticated" console is the worse outcome.
      //
      // The signing key goes with it. It outlives no session: whoever signs in
      // next must present their own, or the console would offer to sign as the
      // operator who just left.
      useOperatorKeyStore.getState().clear();
      clearProtectedQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: adminSessionQueryKey });
    },
  });
}
