import { Introduction } from "#/components/introduction/introduction";
import { completeIntroduction } from "#/components/introduction/introduction-state";
import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";

import { OnboardingMenu } from "#/components/language-selector";
import { InstallAppLink } from "#/components/install-app-link";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { PLATFORM_ABOUT_URL } from "#/lib/legal";
import { onboardingSearch } from "#/lib/onboarding-search";

/**
 * Welcome entry: browse the public market, create an account, or sign in.
 * Sign-in methods live on the signin step so this screen never mixes
 * "who are you" with wallet primitives.
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
    <div className="relative flex min-h-[100svh] flex-col bg-background px-6 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <OnboardingMenu />
      <div className="mt-8 flex flex-col gap-6">
        <CLCLogo className="size-14" sharp />
        <div className="space-y-2">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>Cosmo-Local Credit</Trans>
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            <Trans>
              Cosmo-Local Credit helps people and organizations support, share, and exchange goods
              and services.
            </Trans>{" "}
            <a
              href={PLATFORM_ABOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              <Trans>About Cosmo-Local Credit</Trans>
            </a>
          </p>
        </div>
      </div>

      <div className="space-y-3 pt-8 pb-2">
        <Button tap className="w-full" onClick={() => go("profile")}>
          <Trans>Create account</Trans>
        </Button>
        <Button variant="outline" tap className="w-full" onClick={() => go("signin")}>
          <Trans>I already have an account</Trans>
        </Button>
        <Button
          variant="ghost"
          tap
          className="w-full"
          onClick={() => {
            complete();
            void navigate({ to: "/" });
          }}
        >
          <Trans>Market</Trans>
        </Button>
        <InstallAppLink openDialog />
      </div>
      <Introduction inline />
    </div>
  );
}
