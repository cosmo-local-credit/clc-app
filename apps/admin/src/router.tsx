import {
  BackendApiError,
  backendRetryDelayMs,
  isRetryableBackendError,
} from "@clc/api/client/errors";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { adminSessionQueryKey, clearProtectedQueries } from "#/features/auth/admin-session";
import { routeTree } from "./routeTree.gen";

const MAX_RETRIES = 2;

/**
 * A session that the backend no longer accepts.
 *
 * Any admin request answering 401 means the cookie expired or was revoked, so the
 * session query must be re-read — otherwise AuthBoundary keeps rendering the
 * console from its last successful check while every panel shows an error, and
 * the operator is never told to sign in again.
 */
function isAuthExpiredError(error: unknown): boolean {
  return error instanceof BackendApiError && error.kind === "unauthenticated";
}

export function getRouter() {
  let queryClient: QueryClient;

  const revalidateSession = (error: unknown) => {
    if (!isAuthExpiredError(error)) return;
    // The session is gone, so what was fetched under it must go too. Otherwise a
    // different operator signing in next inherits the previous one's rows from a
    // cache that is still inside its staleTime.
    clearProtectedQueries(queryClient);
    void queryClient.invalidateQueries({ queryKey: adminSessionQueryKey });
  };

  queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: revalidateSession }),
    mutationCache: new MutationCache({ onError: revalidateSession }),
    defaultOptions: {
      queries: {
        // Longer than apps/web's 60s: admin lists are read-mostly and an
        // operator scanning between screens should not refetch on every visit.
        staleTime: 120_000,
        refetchOnWindowFocus: false,
        // Retry only what a second identical attempt can fix — transport
        // failures and server faults. Retrying a 403 or a validation error just
        // multiplies it, and delays the operator seeing what actually happened.
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && isRetryableBackendError(error),
        retryDelay: (attempt, error) => backendRetryDelayMs(error, attempt),
      },
      mutations: { retry: 0 },
    },
  });

  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
