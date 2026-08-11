import { configureApi } from "@clc/core/lib/api";
import { QueryCache, QueryClient, MutationCache } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { BackendApiError } from "@clc/api/features/auth/client";
import { authSessionQueryKey } from "#/features/auth/hooks/use-auth-status";
import { routeTree } from "./routeTree.gen";

if (import.meta.env.VITE_API_URL) {
  configureApi(import.meta.env.VITE_API_URL);
}

function isAuthExpiredError(error: unknown): boolean {
  return error instanceof BackendApiError && (error.status === 401 || error.code === "E06");
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
