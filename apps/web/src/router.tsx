import { BackendApiError } from "@clc/api/client/errors";
import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { routeTree } from "./routeTree.gen";

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
