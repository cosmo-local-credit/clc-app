import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { IntroductionProvider } from "./introduction-provider";
import { parseHomeSearch } from "#/lib/navigation/home-tabs";
import { parseOnboardingSearch } from "#/lib/onboarding-search";

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => ({ state: "guest", isLoading: false, isAuthenticated: false }),
}));
vi.mock("./introduction-state", async (original) => ({
  ...(await original<typeof import("./introduction-state")>()),
  hasSeenIntroduction: () => false,
  completeIntroduction: vi.fn(),
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
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
    expect(router.state.location.search).toMatchObject({ step: "profile" });
    if (url.includes("redirect"))
      expect(router.state.location.search).toMatchObject({ redirect: "/wallet/send" });
  },
);
