import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  exitOnboarding,
  getOnboardingHistoryRootIndex,
  isOnboardingExitInProgress,
  noteOnboardingHistoryRoot,
  resetOnboardingExitState,
} from "./onboarding-exit";

afterEach(() => {
  resetOnboardingExitState();
});

describe("onboarding exit history drain", () => {
  it("notes the first onboarding entry index once per visit", () => {
    const history = createMemoryHistory({
      initialEntries: ["/", "/onboarding?step=welcome"],
    });
    noteOnboardingHistoryRoot(history);
    const root = getOnboardingHistoryRootIndex();
    expect(root).toBe(history.location.state.__TSR_index);

    history.push("/onboarding?step=profile");
    noteOnboardingHistoryRoot(history);
    expect(getOnboardingHistoryRootIndex()).toBe(root);
  });

  it("goes back before the root then pushes dest via history.push", () => {
    const history = createMemoryHistory({ initialEntries: ["/"] });
    history.push("/onboarding?step=welcome");
    noteOnboardingHistoryRoot(history);
    history.push("/onboarding?step=profile");
    history.push("/onboarding?step=card");

    exitOnboarding({ history, dest: "/" });

    expect(history.location.pathname).toBe("/");
    expect(getOnboardingHistoryRootIndex()).toBeNull();
  });

  it("is idempotent — a second concurrent exit is ignored", () => {
    const history = createMemoryHistory({ initialEntries: ["/"] });
    history.push("/onboarding?step=welcome");
    noteOnboardingHistoryRoot(history);
    history.push("/onboarding?step=card");

    exitOnboarding({ history, dest: "/" });
    expect(isOnboardingExitInProgress()).toBe(true);
    const hrefAfterFirst = history.location.href;

    exitOnboarding({ history, dest: "/wallet" });
    // Still at first exit destination; second call is a no-op.
    expect(history.location.href).toBe(hrefAfterFirst);
  });

  it("deep-link root (index 0): replace+push truncates Forward onboarding steps", () => {
    const history = createMemoryHistory({
      initialEntries: ["/onboarding?step=welcome"],
    });
    noteOnboardingHistoryRoot(history);
    history.push("/onboarding?step=profile");
    history.push("/onboarding?step=card");

    exitOnboarding({ history, dest: "/" });

    expect(history.location.pathname).toBe("/");
    history.forward();
    expect(history.location.href).not.toContain("step=profile");
    expect(history.location.href).not.toContain("step=card");
  });

  it("aborts without landing when the target index cannot be reached", () => {
    const history = createMemoryHistory({ initialEntries: ["/"] });
    history.push("/onboarding?step=welcome");
    noteOnboardingHistoryRoot(history);
    history.push("/onboarding?step=card");

    // Block go so the index never moves toward the target.
    const originalGo = history.go.bind(history);
    history.go = () => {
      /* no-op */
    };

    vi.useFakeTimers();
    exitOnboarding({ history, dest: "/" });
    // Exhaust poll retries (~50 * 20ms).
    vi.advanceTimersByTime(1200);
    vi.useRealTimers();

    // Still on card — did not land from the wrong entry.
    expect(history.location.href).toContain("step=card");
    expect(isOnboardingExitInProgress()).toBe(false);

    history.go = originalGo;
  });

  it("truncates Forward through a real Router after deep-link exit", async () => {
    resetOnboardingExitState();
    const rootRoute = createRootRoute({ component: Outlet });
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <div data-testid="home">home</div>,
    });
    const onboardingRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/onboarding",
      validateSearch: (s: Record<string, unknown>) => ({
        step: typeof s.step === "string" ? s.step : "welcome",
      }),
      component: () => <div data-testid="onboarding">onboarding</div>,
    });

    const history = createMemoryHistory({
      initialEntries: ["/onboarding?step=welcome"],
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([homeRoute, onboardingRoute]),
      history,
    });
    await router.load();
    render(<RouterProvider router={router} />);

    noteOnboardingHistoryRoot(router.history);
    await act(async () => {
      await router.navigate({ to: "/onboarding", search: { step: "profile" } });
    });
    await act(async () => {
      await router.navigate({ to: "/onboarding", search: { step: "card" } });
    });

    await act(async () => {
      exitOnboarding({ history: router.history, dest: "/" });
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });

    await act(async () => {
      router.history.forward();
    });

    await waitFor(() => {
      expect(router.state.location.href).not.toContain("step=profile");
      expect(router.state.location.href).not.toContain("step=card");
    });
  });
});
