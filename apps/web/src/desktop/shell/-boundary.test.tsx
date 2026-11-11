import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DESKTOP_MEDIA } from "#/desktop/layout";

const auth = vi.hoisted(() => ({
  state: "authenticated" as const,
  address: "0x1111111111111111111111111111111111111111" as `0x${string}`,
  session: { address: "0x1111111111111111111111111111111111111111" } as Record<string, unknown>,
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({ useAuthStatus: () => auth }));
vi.mock("#/desktop/shell/desktop-shell", () => ({
  DesktopShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

import { DesktopBoundary } from "./boundary";

async function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <DesktopBoundary>
        <p>page</p>
      </DesktopBoundary>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => null }),
      createRoute({ getParentRoute: () => rootRoute, path: "/recovery", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  await screen.findByText("page");
}

beforeEach(() => {
  auth.session = { address: auth.address };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === DESKTOP_MEDIA,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  document.documentElement.dataset.layout = "desktop";
});

afterEach(() => {
  delete document.documentElement.dataset.layout;
  vi.unstubAllGlobals();
});

describe("DesktopBoundary", () => {
  it("wraps a desktop route in the shell", async () => {
    await renderAt("/");
    expect(screen.getByTestId("shell")).toBeTruthy();
  });

  it("leaves a retiring account without the sidebar that leads to the marketplace", async () => {
    auth.session = { address: auth.address, accountLifecycle: "RETIREMENT_SCHEDULED" };
    await renderAt("/recovery");
    expect(screen.queryByTestId("shell")).toBeNull();
  });

  it("keeps the shell for an active account that names its lifecycle", async () => {
    auth.session = { address: auth.address, accountLifecycle: "ACTIVE" };
    await renderAt("/");
    expect(screen.getByTestId("shell")).toBeTruthy();
  });
});
