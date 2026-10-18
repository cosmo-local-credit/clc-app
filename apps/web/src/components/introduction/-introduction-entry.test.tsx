import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { IntroductionProvider } from "./introduction-provider";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { parseHomeSearch } from "#/lib/navigation/home-tabs";
import { parseOnboardingSearch } from "#/lib/onboarding-search";

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ state: "guest", isLoading: false, isAuthenticated: false }),
}));
const completion = vi.hoisted(() => ({ seen: false }));
beforeEach(() => {
  completion.seen = false;
});
vi.mock("./introduction-state", async (original) => ({
  ...(await original<typeof import("./introduction-state")>()),
  hasSeenIntroduction: () => completion.seen,
  completeIntroduction: () => {
    completion.seen = true;
  },
}));
vi.mock("#/components/install-app-link", () => ({ InstallAppLink: () => null }));
vi.mock("#/components/language-selector", () => ({ OnboardingMenu: () => null }));
vi.mock("./introduction", () => ({ Introduction: () => <p>Inline introduction</p> }));

it.each(["/", "/onboarding?redirect=%2Fwallet%2Fsend"])(
  "shows inline introduction at %s and enters setup on Create account",
  async (url) => {
    const root = createRootRoute({
      component: () => (
        <IntroductionProvider>
          <Outlet />
        </IntroductionProvider>
      ),
    });
    const home = createRoute({
      getParentRoute: () => root,
      path: "/",
      validateSearch: parseHomeSearch,
      component: () => <p>Market</p>,
    });
    const onboarding = createRoute({
      getParentRoute: () => root,
      path: "/onboarding",
      validateSearch: parseOnboardingSearch,
      component: () => <p>Account setup</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([home, onboarding]),
      history: createMemoryHistory({ initialEntries: [url] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByText("Inline introduction");
    expect(
      screen
        .getByText("Inline introduction")
        .compareDocumentPosition(screen.getByRole("button", { name: "Create account" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
    expect(router.state.location.search).toMatchObject({ step: "profile" });
    if (url.includes("redirect"))
      expect(router.state.location.search).toMatchObject({ redirect: "/wallet/send" });
  },
);

it.each([false, true])(
  "shows locked-page guidance only before completion (seen=%s)",
  async (seen) => {
    completion.seen = seen;
    const root = createRootRoute({
      component: () => (
        <IntroductionProvider>
          <Outlet />
        </IntroductionProvider>
      ),
    });
    const locked = createRoute({
      getParentRoute: () => root,
      path: "/wallet/send",
      component: () => (
        <AuthenticatedRoute>
          <p>Private wallet</p>
        </AuthenticatedRoute>
      ),
    });
    const onboarding = createRoute({
      getParentRoute: () => root,
      path: "/onboarding",
      validateSearch: parseOnboardingSearch,
      component: () => <p>Account setup</p>,
    });
    const router = createRouter({
      routeTree: root.addChildren([locked, onboarding]),
      history: createMemoryHistory({ initialEntries: ["/wallet/send"] }),
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Sign in to continue" });
    const create = screen.getByRole("link", { name: "Create account" });
    if (seen) {
      expect(screen.queryByText("Inline introduction")).toBeNull();
    } else {
      const intro = await screen.findByText("Inline introduction");
      expect(intro.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.queryByText("Private wallet")).toBeNull();
    fireEvent.click(create);
    await screen.findByText("Account setup");
    expect(router.state.location.search).toMatchObject({
      step: "profile",
      redirect: "/wallet/send",
    });
    expect(completion.seen).toBe(true);
  },
);
