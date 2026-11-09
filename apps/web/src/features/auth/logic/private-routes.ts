import type { AuthStatus } from "#/features/auth/hooks/use-auth-status";

/**
 * Whether to offer the routes `AuthenticatedRoute` guards. Loading counts as
 * yes, so a returning user's chrome does not appear and then pop out while the
 * session check runs; a guest settles on `guest` without a stored wallet to
 * reconnect, so they rarely see it at all. A connected wallet with no session,
 * and a failed check, both hide them: neither can open those routes.
 *
 * It lives apart from the hook because 68 test files mock that module, and a
 * pure predicate should not have to be restated in every one of them.
 */
export function canReachPrivateRoutes(auth: Pick<AuthStatus, "isAuthenticated" | "isLoading">) {
  return auth.isAuthenticated || auth.isLoading;
}
