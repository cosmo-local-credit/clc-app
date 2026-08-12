import {
  BackendApiError,
  backendRetryDelayMs,
  isRetryableBackendError,
} from "@clc/api/client/errors";
import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { routeTree } from "./routeTree.gen";

const MAX_RETRIES = 2;

function isAuthExpiredError(error: unknown): boolean {
  return error instanceof BackendApiError && error.kind === "unauthenticated";
}

function createWebQueryClient(): QueryClient {
  let queryClient: QueryClient;
  queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isAuthExpiredError(error)) {
          void queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isAuthExpiredError(error)) {
          void queryClient.invalidateQueries({ queryKey: authSessionQueryKey });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        // Retry only what a second identical attempt can fix — transport
        // failures and server faults. A 401, 403 or validation error is replayed
        // to no purpose, and a 429 must wait for the interval the backend named.
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && isRetryableBackendError(error),
        retryDelay: (attempt, error) => backendRetryDelayMs(error, attempt),
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
