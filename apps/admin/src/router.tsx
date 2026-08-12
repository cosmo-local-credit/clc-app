import { backendRetryDelayMs, isRetryableBackendError } from "@clc/api/client/errors";
import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const MAX_RETRIES = 2;

export function getRouter() {
  const queryClient = new QueryClient({
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
