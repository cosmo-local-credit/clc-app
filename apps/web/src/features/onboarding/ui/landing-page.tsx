import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";

import { OnboardingMenu } from "#/components/language-selector";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { onboardingSearch } from "#/lib/onboarding-search";

/**
 * Screen A — Welcome fork. Identity only: create an account, or sign in.
 * Sign-in methods live on the signin step so this screen never mixes
 * "who are you" with wallet primitives.
 */
export function LandingPage({ redirectTo }: { redirectTo?: string }) {
  const navigate = useNavigate();

  function go(step: "profile" | "signin") {
    // Push so screen Back and browser Back both return to welcome.
    void navigate({
      to: "/onboarding",
      search: onboardingSearch(step, redirectTo),
    });
  }

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-background px-6 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <OnboardingMenu />
      <div className="mt-8 flex flex-col gap-6">
        <CLCLogo className="size-14" sharp />
        <div className="space-y-2">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>Cosmo-Local Credit</Trans>
          </h1>
          <p className="text-muted-foreground text-[0.9375rem] leading-relaxed">
            <Trans>Route redeemable claims across curated markets with shared standards.</Trans>
          </p>
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-8 pb-2">
        <Button className="h-11 w-full" onClick={() => go("profile")}>
          <Trans>Create account</Trans>
        </Button>
        <Button variant="outline" className="h-11 w-full" onClick={() => go("signin")}>
          <Trans>I already have an account</Trans>
        </Button>
      </div>
    </div>
  );
}
