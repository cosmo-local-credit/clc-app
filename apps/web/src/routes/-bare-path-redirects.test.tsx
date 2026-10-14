import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Route as PostsIndexRoute } from "./posts/index";
import { Route as SettingsIndexRoute } from "./settings/index";
import { Route as WalletIndexRoute } from "./wallet/index";

// These routes ignore their beforeLoad context, so a zero-arg signature is
// enough to mount them on a synthetic tree.
type BareRedirect = () => void;

const BARE_PATHS = [
  { path: "/posts", search: "?tab=posts", beforeLoad: PostsIndexRoute.options.beforeLoad },
  { path: "/settings", search: "?tab=settings", beforeLoad: SettingsIndexRoute.options.beforeLoad },
  { path: "/wallet", search: "?tab=wallet", beforeLoad: WalletIndexRoute.options.beforeLoad },
] as const;

const rootRoute = createRootRoute({ component: Outlet });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : "market",
    view: typeof search.view === "string" ? search.view : undefined,
  }),
  component: () => <div data-testid="home" />,
});

const originRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wallet/receive",
  component: () => <div data-testid="origin" />,
});

function mountAt(initialEntries: string[], path: string, beforeLoad: BareRedirect) {
  const bareRoute = createRoute({ getParentRoute: () => rootRoute, path, beforeLoad });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, originRoute, bareRoute]),
    history: createMemoryHistory({ initialEntries }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("bare tab paths", () => {
  for (const bare of BARE_PATHS) {
    it(`sends ${bare.path} to ${bare.search}`, async () => {
      const router = mountAt([bare.path], bare.path, bare.beforeLoad as BareRedirect);

      await waitFor(() => expect(screen.queryByTestId("home")).not.toBeNull());
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.location.searchStr).toBe(bare.search);
    });

    it(`leaves no history entry for Back to bounce off ${bare.path}`, async () => {
      const router = mountAt(["/wallet/receive"], bare.path, bare.beforeLoad as BareRedirect);
      await waitFor(() => expect(screen.queryByTestId("origin")).not.toBeNull());

      await act(async () => {
        await router.navigate({ to: bare.path });
      });
      await waitFor(() => expect(screen.queryByTestId("home")).not.toBeNull());

      act(() => {
        router.history.back();
      });

      await waitFor(() => expect(screen.queryByTestId("origin")).not.toBeNull());
      expect(router.state.location.pathname).toBe("/wallet/receive");
    });
  }
});
