import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiBookOpenLine } from "react-icons/ri";

import {
  useFirstVisitIntroduction,
  useIntroductionReplay,
} from "#/components/introduction/introduction-provider";
import { OnboardingScreen, OnboardingTitle } from "#/components/onboarding-screen";
import { ActionRow } from "#/components/ui/action-row";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { onboardingSearch } from "#/lib/onboarding-search";
import { sanitizeInternalRedirect } from "./redirect";

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const auth = useAuthStatus();

  if (auth.isLoading) return <AuthRouteFallback />;
  if (auth.isAuthenticated) return <>{children}</>;
  if (auth.state === "sessionCheckError") {
    return <SessionCheckError onRetry={auth.retry} retrying={auth.retrying} />;
  }
  return <AuthRequiredScreen />;
}

function AuthRouteFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}

/** A plain page, not a card: the check failed, and retrying is the one thing to do. */
function SessionCheckError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <OnboardingScreen
      start={<CLCLogo className="size-9" sharp />}
      footer={
        <Button tap className="w-full" pending={retrying} onClick={onRetry}>
          <Trans>Try again</Trans>
        </Button>
      }
    >
      <OnboardingTitle>
        <Trans>Session check failed</Trans>
      </OnboardingTitle>
      <p className="text-muted-foreground text-sm">
        <Trans>We could not verify your session. Check your connection and try again.</Trans>
      </p>
    </OnboardingScreen>
  );
}

/**
 * Gated deep-link gate. Same two-button fork as the onboarding welcome screen
 * so every entry point uses the same labels and destinations. The guide is one
 * row away rather than in front of the fork: whoever opened a shared link came
 * for that page.
 */
function AuthRequiredScreen() {
  const { t } = useLingui();
  const location = useLocation();
  const introduction = useFirstVisitIntroduction();
  const replay = useIntroductionReplay();
  const redirectTo = sanitizeInternalRedirect(
    `${location.pathname}${location.searchStr}${location.hash}`,
  );

  return (
    <OnboardingScreen
      start={<CLCLogo className="size-9" sharp />}
      footer={
        <>
          {/*
            Replace the protected URL so onboarding does not stack above it.
            Finish then replaces the single onboarding slot with the destination.
          */}
          <Button asChild tap className="w-full">
            <Link
              to="/onboarding"
              search={onboardingSearch("profile", redirectTo)}
              replace
              onClick={introduction.complete}
            >
              <Trans>Create account</Trans>
            </Link>
          </Button>
          <Button asChild variant="outline" tap className="w-full">
            <Link
              to="/onboarding"
              search={onboardingSearch("signin", redirectTo)}
              replace
              onClick={introduction.complete}
            >
              <Trans>I already have an account</Trans>
            </Link>
          </Button>
          <Button
            asChild
            variant="link"
            tap
            className="w-full text-muted-foreground hover:text-foreground"
          >
            <Link to="/" replace>
              <Trans>Back to market</Trans>
            </Link>
          </Button>
        </>
      }
    >
      <OnboardingTitle>
        <Trans>Sign in to continue</Trans>
      </OnboardingTitle>
      {replay ? (
        <div className="border border-border bg-card">
          <ActionRow
            icon={<RiBookOpenLine className="size-4" aria-hidden="true" />}
            label={t({ id: "intro.replay", message: "How to use CLC" })}
            onClick={replay}
          />
        </div>
      ) : null}
    </OnboardingScreen>
  );
}
