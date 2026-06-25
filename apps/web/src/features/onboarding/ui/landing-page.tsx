import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { FiUserPlus } from "react-icons/fi";

import { SignInPanel } from "#/components/auth/sign-in-panel";
import { OnboardingMenu } from "#/components/language-selector";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-[100svh] flex-col bg-background px-6 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <OnboardingMenu />
      <div className="flex flex-col items-center gap-5 text-center">
        <CLCLogo className="size-20" />
        <div className="space-y-1">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">CLC</h1>
          <p className="text-muted-foreground text-sm">
            <Trans>Route redeemable claims across curated markets with shared standards.</Trans>
          </p>
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-8 pb-2">
        <Button
          className="h-11 w-full bg-foreground text-background hover:bg-foreground/90"
          onClick={() => void navigate({ to: "/onboarding" })}
        >
          <FiUserPlus className="mr-2 size-4" aria-hidden="true" />
          <Trans>Create an account</Trans>
        </Button>
        <div className="flex items-center gap-3 text-muted-foreground text-[11px] tracking-[0.24em] uppercase">
          <div className="h-px flex-1 bg-border" />
          <span>
            <Trans>or</Trans>
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <SignInPanel onAuthenticated={() => void navigate({ to: "/", replace: true })} />
      </div>
    </div>
  );
}
