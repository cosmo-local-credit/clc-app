/**
 * Admin session — STUB.
 *
 * The real mechanism is not built yet: clc-core does not currently expose admin
 * roles or a back-office session endpoint, and the user-facing passkey + wallet
 * session in apps/web is the wrong shape for an operator console. This module is
 * the single seam where that lands, so no surface has to change when it does.
 *
 * Replace `useAdminSession` with a real query against the admin session endpoint
 * (via a client in @clc/api) and delete the dev override below. Everything else
 * — the route guard, the shell, the four surfaces — already reads through here.
 */

import { useQuery } from "@tanstack/react-query";

export type AdminRole = "steward" | "operator" | "auditor";

export type AdminOperator = {
  address: string;
  name: string;
  role: AdminRole;
};

export type AdminSession =
  | { status: "authenticated"; operator: AdminOperator }
  | { status: "unauthenticated" }
  | { status: "loading" };

export const adminSessionQueryKey = ["admin", "session"] as const;

// Stub operator used until the backend contract exists. Deliberately obvious in
// the UI so a stubbed session is never mistaken for a real one.
const STUB_OPERATOR: AdminOperator = {
  address: "0x0000000000000000000000000000000000000000",
  name: "Stub operator",
  role: "steward",
};

export function useAdminSession(): AdminSession {
  const query = useQuery({
    queryKey: adminSessionQueryKey,
    queryFn: (): Promise<AdminOperator | null> => Promise.resolve(STUB_OPERATOR),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (query.isPending) return { status: "loading" };
  return query.data
    ? { status: "authenticated", operator: query.data }
    : { status: "unauthenticated" };
}

/** True while the session is a stub rather than a real backend session. */
export const IS_STUB_SESSION = true;
