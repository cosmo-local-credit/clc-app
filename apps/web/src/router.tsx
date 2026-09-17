import { BackendApiError } from "@clc/api/client/errors";
import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { clearInMemoryDrafts, clearScopedQueries } from "#/features/auth/api/identity-reset";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { routeTree } from "./routeTree.gen";

function isAuthExpiredError(error: unknown): boolean {
  return error instanceof BackendApiError && error.kind === "unauthenticated";
}

function createWebQueryClient(): QueryClient {
  let queryClient: QueryClient;

  /**
   * The expiry half of the identity boundary, in the one place every query and
   * mutation already reports to.
   *
   * A session that lapses and a different person signing in are the same hazard,
   * and only one of those involves anyone pressing "Sign out" — so the cached
   * rows have to go here too, not just in the sign-out handler. `apps/admin`
   * already does exactly this (`apps/admin/src/router.tsx`).
   *
   * It deliberately does **not** clear the stored credentials. A 401 means the
   * cookie lapsed, not that the device changed hands, and destroying the key
   * would strand a user who can still re-authenticate by SIWE.
   */
  const revalidateSession = (error: unknown) => {
    if (!isAuthExpiredError(error)) return;
    clearScopedQueries(queryClient);
    clearInMemoryDrafts();
    void queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
  };

  queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: revalidateSession }),
    mutationCache: new MutationCache({ onError: revalidateSession }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        // Left alone deliberately. The kind-aware policy in apps/admin's router
        // is better, but changing it here would alter request counts and error
        // timing throughout an app this branch is only meant to refactor.
        // Adopting it for web is its own change, with its own testing.
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
  return queryClient;
}

export function getRouter() {
  const queryClient = createWebQueryClient();
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
