import { Trans } from "@lingui/react/macro";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { onboardingSearch } from "#/lib/onboarding-search";
import { sanitizeInternalRedirect } from "./redirect";

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const auth = useAuthStatus();

  if (auth.isLoading) return <AuthRouteFallback />;
  if (auth.isAuthenticated) return <>{children}</>;
  if (auth.state === "sessionCheckError") return <SessionCheckError onRetry={auth.retry} />;
  return <AuthRequiredScreen />;
}

function AuthRouteFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}

function SessionCheckError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-20 pb-12">
      <div className="rounded-xl border border-border bg-card p-4">
        <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
          <Trans>Session check failed</Trans>
        </h1>
        <p className="mt-2 text-muted-foreground text-sm">
          <Trans>We could not verify your session. Check your connection and try again.</Trans>
        </p>
        <Button className="mt-4 h-11 w-full" onClick={onRetry}>
          <Trans>Try again</Trans>
        </Button>
      </div>
    </div>
  );
}

/**
 * Gated deep-link gate. Same two-button fork as the onboarding welcome screen
 * so every entry point uses the same labels and destinations.
 */
function AuthRequiredScreen() {
  const location = useLocation();
  const redirectTo = sanitizeInternalRedirect(
    `${location.pathname}${location.searchStr}${location.hash}`,
  );

  return (
    <div className="flex min-h-[100svh] flex-col bg-background px-6 pt-20 pb-12">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>Sign in to continue</Trans>
          </h1>
          <p className="text-muted-foreground text-sm">
            <Trans>Wallet actions are available after you sign up or sign in.</Trans>
          </p>
        </div>

        <div className="space-y-2">
          {/*
            Replace the protected URL so onboarding does not stack above it.
            Finish then replaces the single onboarding slot with the destination.
          */}
          <Button asChild className="h-11 w-full">
            <Link to="/onboarding" search={onboardingSearch("profile", redirectTo)} replace>
              <Trans>Create account</Trans>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/onboarding" search={onboardingSearch("signin", redirectTo)} replace>
              <Trans>I already have an account</Trans>
            </Link>
          </Button>
        </div>

        <Link
          to="/"
          replace
          className="block text-center text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
        >
          <Trans>Back to market</Trans>
        </Link>
      </div>
    </div>
  );
}
