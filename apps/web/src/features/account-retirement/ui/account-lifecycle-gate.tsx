import { Navigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { lifecycleRedirect } from "../logic/lifecycle";

/**
 * Keeps a retiring account in the recovery shell and an active one out of it.
 *
 * It stands in the root, above every route, because the session lives in a
 * query keyed by the connected wallet and a route's `beforeLoad` cannot read
 * it. While a redirect is due nothing of the route renders, so a restricted
 * screen never flashes before the shell replaces it. The redirect replaces the
 * entry: Back must not return to a screen the account may no longer open.
 */
export function AccountLifecycleGate({ children }: { children: ReactNode }) {
  const auth = useAuthStatus();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const target = lifecycleRedirect(pathname, auth);
  if (target) return <Navigate to={target} replace />;
  return children;
}
