/**
 * Real-history regressions for onboarding.
 *
 * Uses createMemoryHistory + the real exit helper / BackChevron semantics so
 * browser Back, screen Back, finish drain, and protected-route entry are
 * exercised without fully mocking the production step screens away.
 */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BackChevron } from "#/components/wallet/wallet-layout";
import {
  exitOnboarding,
  noteOnboardingHistoryRoot,
  resetOnboardingExitState,
} from "#/lib/onboarding-exit";
import { onboardingSearch, parseOnboardingSearch } from "#/lib/onboarding-search";

const { authState } = vi.hoisted(() => ({
  authState: {
    current: {
      state: "guest" as string,
      isLoading: false,
      isAuthenticated: false,
    },
  },
}));

vi.mock("#/features/auth/hooks/use-auth-status", () => ({
  useAuthStatus: () => authState.current,
}));

function AuthGateStub() {
  return (
    <div data-testid="auth-gate">
      <Link to="/onboarding" search={onboardingSearch("profile", "/wallet/send")} replace>
        Create account
      </Link>
    </div>
  );
}

async function renderApp(initialEntries: string[]) {
  resetOnboardingExitState();
  const rootRoute = createRootRoute({ component: Outlet });
  const marketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-testid="market">Market</div>,
  });
  const walletSendRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/wallet/send",
    component: () => (
      <div>
        <AuthGateStub />
        <div data-testid="protected">Protected</div>
      </div>
    ),
  });

  const onboardingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/onboarding",
    validateSearch: (search: Record<string, unknown>) => parseOnboardingSearch(search),
    component: function TestOnboardingScreen() {
      const navigate = useNavigate();
      const router = useRouter();
      const { step, redirect } = onboardingRoute.useSearch();

      // Route-level note is simulated here for the synthetic tree.
      noteOnboardingHistoryRoot(router.history);

      if (step === "welcome") {
        return (
          <div data-testid="landing">
            <button
              type="button"
              onClick={() =>
                void navigate({
                  to: "/onboarding",
                  search: onboardingSearch("profile", redirect),
                })
              }
            >
              Create account
            </button>
            <button
              type="button"
              onClick={() =>
                void navigate({
                  to: "/onboarding",
                  search: onboardingSearch("signin", redirect),
                })
              }
            >
              I already have an account
            </button>
          </div>
        );
      }

      if (step === "signin") {
        return (
          <div data-testid="signin">
            <BackChevron
              label="Back"
              to="/onboarding"
              search={onboardingSearch("welcome", redirect)}
            />
            <button
              type="button"
              onClick={() =>
                void navigate({
                  to: "/onboarding",
                  search: onboardingSearch("profile", redirect),
                })
              }
            >
              Create an account
            </button>
            <button
              type="button"
              onClick={() =>
                exitOnboarding({
                  history: router.history,
                  dest: redirect ?? "/",
                })
              }
            >
              Sign in success
            </button>
          </div>
        );
      }

      if (step === "profile") {
        return (
          <div data-testid="flow-profile">
            <BackChevron
              label="Back"
              to="/onboarding"
              search={onboardingSearch("welcome", redirect)}
            />
            <button
              type="button"
              onClick={() =>
                void navigate({
                  to: "/onboarding",
                  search: onboardingSearch("method", redirect),
                })
              }
            >
              profile-next
            </button>
            <Link
              to="/onboarding"
              search={onboardingSearch("signin", redirect)}
              replace
              data-testid="profile-signin-link"
            >
              Go back to sign in
            </Link>
          </div>
        );
      }

      if (step === "method") {
        return (
          <div data-testid="flow-method">
            <BackChevron
              label="Back"
              to="/onboarding"
              search={onboardingSearch("profile", redirect)}
            />
            <button
              type="button"
              onClick={() =>
                void navigate({
                  to: "/onboarding",
                  search: onboardingSearch("card", redirect),
                })
              }
            >
              method-next
            </button>
          </div>
        );
      }

      return (
        <div data-testid="flow-card">
          <BackChevron
            label="Back"
            to="/onboarding"
            search={onboardingSearch("method", redirect)}
          />
          <button
            type="button"
            onClick={() =>
              exitOnboarding({
                history: router.history,
                dest: redirect ?? "/",
              })
            }
          >
            finish
          </button>
        </div>
      );
    },
  });

  const history = createMemoryHistory({ initialEntries });
  const router = createRouter({
    routeTree: rootRoute.addChildren([marketRoute, walletSendRoute, onboardingRoute]),
    history,
  });

  await router.load();
  render(<RouterProvider router={router} />);
  return { history, router };
}

beforeEach(() => {
  authState.current = {
    state: "guest",
    isLoading: false,
    isAuthenticated: false,
  };
  resetOnboardingExitState();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  resetOnboardingExitState();
  vi.restoreAllMocks();
});

describe("onboarding history", () => {
  it("keeps screen Back and browser Back on the same step stack", async () => {
    const { history } = await renderApp(["/", "/onboarding?step=welcome"]);

    fireEvent.click(await screen.findByRole("button", { name: "Create account" }));
    await screen.findByTestId("flow-profile");
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    await screen.findByTestId("flow-method");
    fireEvent.click(screen.getByRole("button", { name: "method-next" }));
    await screen.findByTestId("flow-card");

    // Browser Back → method
    await act(async () => {
      history.back();
    });
    await waitFor(() => expect(screen.getByTestId("flow-method")).toBeTruthy());
    expect(history.location.href).toContain("step=method");

    // Screen Back (BackChevron → history.back) → profile
    fireEvent.click(screen.getByRole("link", { name: "Back" }));
    await waitFor(() => expect(screen.getByTestId("flow-profile")).toBeTruthy());
    expect(history.location.href).toContain("step=profile");
  });

  it("drains intermediate steps on finish so Back skips onboarding", async () => {
    const { history } = await renderApp(["/", "/onboarding?step=welcome"]);

    fireEvent.click(await screen.findByRole("button", { name: "Create account" }));
    await screen.findByTestId("flow-profile");
    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    await screen.findByTestId("flow-method");
    fireEvent.click(screen.getByRole("button", { name: "method-next" }));
    await screen.findByTestId("flow-card");

    fireEvent.click(screen.getByRole("button", { name: "finish" }));
    await waitFor(() => expect(screen.getByTestId("market")).toBeTruthy());
    expect(history.location.pathname).toBe("/");

    await act(async () => {
      history.back();
    });
    await waitFor(() => {
      expect(history.location.href).not.toContain("/onboarding");
    });
  });

  it("replaces the protected URL when entering from the auth gate, then drains on finish", async () => {
    const { history } = await renderApp(["/", "/wallet/send"]);
    const lengthBefore = history.length;

    fireEvent.click(await screen.findByRole("link", { name: "Create account" }));
    await screen.findByTestId("flow-profile");
    expect(history.length).toBe(lengthBefore);

    fireEvent.click(screen.getByRole("button", { name: "profile-next" }));
    fireEvent.click(await screen.findByRole("button", { name: "method-next" }));
    fireEvent.click(await screen.findByRole("button", { name: "finish" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/wallet/send");
    });

    await act(async () => {
      history.back();
    });
    await waitFor(() => {
      expect(history.location.pathname).toBe("/");
    });
  });

  it("profile sign-in link uses replace so successful sign-in has no profile under it", async () => {
    const { history } = await renderApp(["/onboarding?step=profile"]);
    await screen.findByTestId("flow-profile");
    const lengthBefore = history.length;

    fireEvent.click(screen.getByTestId("profile-signin-link"));
    await screen.findByTestId("signin");
    expect(history.length).toBe(lengthBefore);
    expect(history.location.href).toContain("step=signin");

    fireEvent.click(screen.getByRole("button", { name: "Sign in success" }));
    await waitFor(() => expect(screen.getByTestId("market")).toBeTruthy());

    await act(async () => {
      history.back();
    });
    await waitFor(() => {
      expect(history.location.href).not.toContain("step=profile");
    });
  });

  it("drops self-referential onboarding redirect from search validation", () => {
    expect(
      parseOnboardingSearch({
        step: "profile",
        redirect: "/onboarding?step=signin",
      }),
    ).toEqual({ step: "profile" });
    expect(
      parseOnboardingSearch({
        step: "profile",
        redirect: "/wallet/send",
      }),
    ).toEqual({ step: "profile", redirect: "/wallet/send" });
  });
});
