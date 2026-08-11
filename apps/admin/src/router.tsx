import { configureApi } from "@clc/core/lib/api";
import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

if (import.meta.env.VITE_API_URL) {
  configureApi(import.meta.env.VITE_API_URL);
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Longer than apps/web's 60s: admin lists are read-mostly and an
        // operator scanning between screens should not refetch on every visit.
        staleTime: 120_000,
        refetchOnWindowFocus: false,
        retry: 1,
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
