/**
 * The admin session.
 *
 * Operators sign in with the same credentials they use on apps/web — a paper
 * wallet (SIWE over a private key) or a passkey — and the console is gated on the
 * role clc-core reports for that account. `SUPERADMIN` is the gate; nothing
 * finer-grained exists on the backend, so nothing finer-grained is modelled here.
 *
 * This module is the only place the gate is decided. The route guard
 * (components/layout/auth-boundary.tsx), the shell and every surface read through
 * `useAdminSession`, so a change to the rule lands in one place.
 *
 * This is a UX gate only. clc-core enforces `requireSuperAdmin` on every
 * /api/v2/admin endpoint and remains the security authority — what renders here
 * cannot grant access the backend withholds.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BackendApiError } from "@clc/api/client/errors";
import type { SessionResult } from "@clc/api/features/auth/client";
import { clcApi } from "#/lib/api";
import { errorMessage } from "#/lib/data-state";

/** The one role that may use this console. */
export const SUPERADMIN_ROLE = "SUPERADMIN";

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
 * Maps the session request's outcome to the five states.
 *
 * Pure and exported so every state can be tested without a query client.
 *
 * A signed-in operator without the role is `unauthorized`, not
 * `unauthenticated`: they hold a valid session, and telling them to sign in
 * again would be a dead end.
 *
 * A session whose role the backend does not report is `unavailable`, not
 * `unauthorized`. Older deployments omit the field, and denying a real superadmin
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
  return role === SUPERADMIN_ROLE
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
      await queryClient.invalidateQueries({ queryKey: adminSessionQueryKey });
    },
  });
}
