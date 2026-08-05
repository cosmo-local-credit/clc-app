import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { FiArrowRight } from "react-icons/fi";

import { onboardingSearch } from "#/lib/onboarding-search";

// Thin top-of-screen announcement strip for guests on the public market. It is
// purely an entry point: tapping it routes to /onboarding, which handles both
// sign-up and sign-in. No inline auth here.
export function OnboardingBanner({ redirectTo }: { redirectTo?: string }) {
  return (
    <div className="absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
      <Link
        to="/onboarding"
        search={onboardingSearch("welcome", redirectTo)}
        className="flex items-center justify-center gap-1.5 bg-primary px-4 py-2 text-center font-medium text-primary-foreground text-xs hover:bg-primary/90"
      >
        <Trans>Sign up or sign in to send, swap, and redeem vouchers</Trans>
        <FiArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
      </Link>
    </div>
  );
}
