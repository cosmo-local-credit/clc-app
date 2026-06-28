import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

import { sanitizeInternalRedirect } from "#/components/auth/redirect";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { LandingPage } from "#/features/onboarding/ui/landing-page";

const OnboardingFlow = lazy(() =>
  import("#/features/onboarding/ui/onboarding-flow").then((module) => ({
    default: module.OnboardingFlow,
  })),
);

export const Route = createFileRoute("/onboarding")({
  validateSearch: (search): { redirect?: string } => ({
    redirect: sanitizeInternalRedirect(search.redirect),
  }),
  component: OnboardingRoutePage,
});

function OnboardingRoutePage() {
  const auth = useAuthStatus();
  const { redirect } = Route.useSearch();
  const navigate = Route.useNavigate();
  // "entry" shows the sign-in / create-account screen; "signup" advances into
  // the profile + wallet flow once the user chooses to create an account.
  const [mode, setMode] = useState<"entry" | "signup">("entry");

  useEffect(() => {
    if (auth.isAuthenticated) {
      void navigate({ to: (redirect ?? "/") as "/", replace: true });
    }
  }, [auth.isAuthenticated, navigate, redirect]);

  if (auth.isLoading || auth.isAuthenticated) return <OnboardingFallback />;

  if (mode === "entry") {
    return <LandingPage onCreateAccount={() => setMode("signup")} redirectTo={redirect} />;
  }

  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingFlow redirectTo={redirect} />
    </Suspense>
  );
}

function OnboardingFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
