/**
 * Admin session — STUBBED.
 *
 * The real mechanism is not built yet: clc-core exposes no back-office session
 * endpoint or operator roles, and the user-facing passkey + wallet session in
 * apps/web is the wrong shape for an operator console. See
 * docs/admin-architecture.md, Track B1.
 *
 * This module is the single seam where that lands. Replacing `resolveSession`'s
 * request is the whole of the client-side work; the route guard, the shell and
 * every surface already read through `useAdminSession`.
 *
 * The state union deliberately models all five cases the architecture requires,
 * including ones the stub cannot currently produce, so that adding the real
 * request cannot silently skip a case — an unhandled status becomes a type error
 * at the boundary rather than a blank screen.
 */

import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "#/lib/data-state";

export type AdminRole = "steward" | "operator" | "auditor";

export type AdminOperator = {
  address: string;
  name: string;
  role: AdminRole;
  /** Permissions the backend granted. Empty until Track B1 supplies them. */
  permissions: ReadonlyArray<string>;
};

export type AdminSession =
  | { status: "loading" }
  | { status: "authenticated"; operator: AdminOperator }
  | { status: "unauthenticated" }
  | { status: "unauthorized"; operator: AdminOperator }
  | { status: "unavailable"; message: string };

/**
 * True while the session is a stub rather than a real backend session.
 *
 * Env-driven rather than hard-coded so the production build guard in
 * vite.config.ts can refuse to ship it. Enabled via VITE_ADMIN_STUB_AUTH in
 * apps/admin/.env; absent from any release build.
 */
export const IS_STUB_SESSION = import.meta.env.VITE_ADMIN_STUB_AUTH === "true";

export const adminSessionQueryKey = ["admin", "session"] as const;

/** The permission every admin surface currently requires. */
export const ADMIN_CONSOLE_PERMISSION = "admin:console";

// Stub operator. Deliberately obvious in the UI so a stubbed session is never
// mistaken for a real one, and deliberately granted the console permission so the
// authorization path is exercised in development rather than bypassed.
const STUB_OPERATOR: AdminOperator = {
  address: "0x0000000000000000000000000000000000000000",
  name: "Stub operator",
  role: "steward",
  permissions: [ADMIN_CONSOLE_PERMISSION],
};

function fetchSession(): Promise<AdminOperator | null> {
  // With the stub disabled there is no session mechanism yet, so the console is
  // unauthenticated rather than silently open.
  return Promise.resolve(IS_STUB_SESSION ? STUB_OPERATOR : null);
}

/**
 * Maps the session request's outcome to the five states.
 *
 * Pure and exported so every state can be tested without a query client. The
 * backend remains the security authority — this only decides what the console
 * shows. An operator lacking the permission is `unauthorized`, not
 * `unauthenticated`: they are signed in, and telling them to sign in again would
 * be a dead end.
 */
export function resolveSession(query: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: AdminOperator | null | undefined;
}): AdminSession {
  if (query.isPending) return { status: "loading" };
  if (query.isError) return { status: "unavailable", message: errorMessage(query.error) };
  if (!query.data) return { status: "unauthenticated" };
  return query.data.permissions.includes(ADMIN_CONSOLE_PERMISSION)
    ? { status: "authenticated", operator: query.data }
    : { status: "unauthorized", operator: query.data };
}

export function useAdminSession(): AdminSession {
  const query = useQuery({
    queryKey: adminSessionQueryKey,
    queryFn: fetchSession,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return resolveSession(query);
}
