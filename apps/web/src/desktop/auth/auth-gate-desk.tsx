import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RiBookOpenLine } from "react-icons/ri";

import {
  useFirstVisitIntroduction,
  useIntroductionReplay,
} from "#/components/introduction/introduction-provider";
import { Button } from "#/components/ui/button";
import { DeskCanvas, DeskTitle } from "#/desktop/ui/page";
import { onboardingSearch } from "#/lib/onboarding-search";

/**
 * A gate on desktop is one 420px tile near the top of the canvas, not the
 * phone's full-height scaffold stretched across it. Its actions stay in the
 * tile, the heading sits directly over them.
 */
function GateTile({ children }: { children: ReactNode }) {
  return (
    <DeskCanvas className="pt-16">
      <section className="grid w-full max-w-105 justify-self-center gap-5 border border-border bg-card p-6">
        {children}
      </section>
    </DeskCanvas>
  );
}

/**
 * A guest on a protected route. The same two-way fork as the welcome screen,
 * both ways carrying this URL as the place to return to after sign-in. The
 * guide stays one button away rather than in front of the fork.
 */
export function DeskAuthRequired({ redirectTo }: { redirectTo?: string }) {
  const introduction = useFirstVisitIntroduction();
  const replay = useIntroductionReplay();

  return (
    <GateTile>
      <DeskTitle>
        <Trans>Sign in to continue</Trans>
      </DeskTitle>
      <div className="grid gap-3">
        {/*
          Replace the protected URL so onboarding does not stack above it.
          Finish then replaces the single onboarding slot with the destination.
        */}
        <Button asChild className="w-full">
          <Link
            to="/onboarding"
            search={onboardingSearch("profile", redirectTo)}
            replace
            onClick={introduction.complete}
          >
            <Trans>Create account</Trans>
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link
            to="/onboarding"
            search={onboardingSearch("signin", redirectTo)}
            replace
            onClick={introduction.complete}
          >
            <Trans>I already have an account</Trans>
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-2 border-border border-t pt-4">
        <Button asChild variant="ghost" className="min-w-0">
          <Link to="/" replace>
            <Trans>Back to market</Trans>
          </Link>
        </Button>
        {replay ? (
          <Button variant="ghost" className="min-w-0" onClick={replay}>
            <RiBookOpenLine aria-hidden="true" />
            <Trans>How to use CLC</Trans>
          </Button>
        ) : null}
      </div>
    </GateTile>
  );
}

/** The session check failed: nothing is known about the person, so the one action is Retry. */
export function DeskSessionCheckError({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <GateTile>
      <DeskTitle>
        <Trans>Session check failed</Trans>
      </DeskTitle>
      <p role="alert" className="text-muted-foreground text-sm">
        <Trans>We could not verify your session. Check your connection and try again.</Trans>
      </p>
      <Button className="w-full" pending={retrying} onClick={onRetry}>
        <Trans>Retry</Trans>
      </Button>
    </GateTile>
  );
}
