import { createFileRoute, useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { LandingPage } from "#/features/onboarding/ui/landing-page";
import { SignInPage } from "#/features/onboarding/ui/sign-in-page";
import {
  exitOnboarding,
  noteOnboardingHistoryRoot,
  resetOnboardingExitState,
} from "#/lib/onboarding-exit";
import { parseOnboardingSearch } from "#/lib/onboarding-search";

const OnboardingFlow = lazy(() =>
  import("#/features/onboarding/ui/onboarding-flow").then((module) => ({
    default: module.OnboardingFlow,
  })),
);

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>) => parseOnboardingSearch(search),
  component: OnboardingRoutePage,
});

function OnboardingRoutePage() {
  const auth = useAuthStatus();
  const { redirect, step } = Route.useSearch();
  const router = useRouter();

  // Remember the first onboarding history entry for this visit so exit can drain
  // intermediate steps. Reset exit latch when leaving the route entirely.
  useEffect(() => {
    noteOnboardingHistoryRoot(router.history);
    return () => {
      resetOnboardingExitState();
    };
  }, [router.history]);

  // Sole history exit for authenticated sessions. Child flows only invalidate
  // the session query; they must not also call exitOnboarding (that raced).
  // Landing uses history.push/replace so Forward truncation works even when
  // dest equals the current path (router.navigate would dedupe that).
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    exitOnboarding({
      history: router.history,
      dest: redirect ?? "/",
    });
  }, [auth.isAuthenticated, redirect, router.history]);

  if (auth.isLoading || auth.isAuthenticated) return <OnboardingFallback />;

  if (step === "welcome") {
    return <LandingPage redirectTo={redirect} />;
  }

  if (step === "signin") {
    return <SignInPage redirectTo={redirect} />;
  }

  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingFlow step={step} redirectTo={redirect} />
    </Suspense>
  );
}

function OnboardingFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
