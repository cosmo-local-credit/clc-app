import { GuideCarousel } from "#/components/introduction/introduction";
import { completeIntroduction } from "#/components/introduction/introduction-state";
import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { RiStore2Line } from "react-icons/ri";

import { InstallAppButton } from "#/components/install-app-button";
import { OnboardingScreen } from "#/components/onboarding-screen";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { onboardingSearch } from "#/lib/onboarding-search";

/**
 * Welcome: the guide fills the screen, and the way in stays under it. Browse
 * the public market, create an account, or sign in; sign-in methods live on
 * the signin step so this screen never mixes "who are you" with wallet
 * primitives.
 */
export function LandingPage({
  redirectTo,
  onComplete,
}: {
  redirectTo?: string;
  onComplete?: () => void;
}) {
  const navigate = useNavigate();
  const complete = onComplete ?? completeIntroduction;

  function go(step: "profile" | "signin") {
    complete();
    // Push so screen Back and browser Back both return to welcome.
    void navigate({
      to: "/onboarding",
      search: onboardingSearch(step, redirectTo),
    });
  }

  return (
    <OnboardingScreen
      start={<CLCLogo className="size-9" sharp />}
      className="pt-2"
      footer={
        <>
          <Button tap className="w-full" onClick={() => go("profile")}>
            <Trans>Create account</Trans>
          </Button>
          <Button variant="outline" tap className="w-full" onClick={() => go("signin")}>
            <Trans>I already have an account</Trans>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              tap
              className="min-w-0"
              onClick={() => {
                complete();
                void navigate({ to: "/" });
              }}
            >
              <RiStore2Line className="size-4" aria-hidden="true" />
              <Trans>Market</Trans>
            </Button>
            <InstallAppButton quiet />
          </div>
        </>
      }
    >
      <GuideCarousel welcome />
    </OnboardingScreen>
  );
}
