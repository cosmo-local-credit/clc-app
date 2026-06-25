import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";

import { sanitizeInternalRedirect } from "#/components/auth/redirect";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";

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

  useEffect(() => {
    if (auth.isAuthenticated) {
      if (redirect) {
        void navigate({ to: redirect as "/", replace: true });
      } else {
        void navigate({ to: "/", replace: true });
      }
    }
  }, [auth.isAuthenticated, navigate, redirect]);

  if (auth.isLoading || auth.isAuthenticated) return <OnboardingFallback />;

  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingFlow redirectTo={redirect} />
    </Suspense>
  );
}

function OnboardingFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
