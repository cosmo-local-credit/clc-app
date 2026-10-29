import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

/** Every place the shell's links and palette can go. Each renders nothing; the tests read the router. */
const PATHS = [
  "/",
  "/market",
  "/wallet/send",
  "/wallet/receive",
  "/vouchers/create/$step",
  "/vouchers/$voucherAddress",
  "/pools/create/$step",
  "/pools/$poolAddress",
  "/catalogs/create",
  "/catalogs/$catalogId",
  "/wants/$wantId",
  "/settings/profile",
] as const;

/**
 * Renders `ui` once, above a real memory router, so links, `navigate` and
 * `useRouterState` behave as in the app. Search is passed through untouched,
 * which is what the shell's links see on the real routes.
 */
export async function renderInShell(ui: ReactNode, url = "/") {
  const root = createRootRoute({
    component: () => (
      <>
        {ui}
        <Outlet />
      </>
    ),
  });
  const children = PATHS.map((path) =>
    createRoute({
      getParentRoute: () => root,
      path,
      validateSearch: (search: Record<string, unknown>) => search,
      component: () => null,
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren(children),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}
