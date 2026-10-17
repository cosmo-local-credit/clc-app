import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { onboardingSearch } from "#/lib/onboarding-search";

// A compact floating entry point for guests on the public market. Tapping it
// routes to /onboarding, which handles both sign-up and sign-in.
export function OnboardingBanner({ redirectTo }: { redirectTo?: string }) {
  return (
    <Button asChild size="lg" className="pointer-events-auto w-full">
      <Link to="/onboarding" search={onboardingSearch("welcome", redirectTo)}>
        <Trans>Sign in or sign up</Trans>
      </Link>
    </Button>
  );
}
