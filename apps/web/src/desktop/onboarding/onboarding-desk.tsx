import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { RiMap2Line } from "react-icons/ri";

import { InstallAppButton } from "#/components/install-app-button";
import { introductionSlides } from "#/components/introduction/introduction-content";
import { completeIntroduction } from "#/components/introduction/introduction-state";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { onboardingSearch, type OnboardingStep } from "#/lib/onboarding-search";
import { ConceptCards } from "./concept-cards";
import { SetupDesk } from "./setup-desk";
import { SignInDesk, SignInSplit } from "./sign-in-desk";

/**
 * Onboarding without the app shell, under one header that keeps language and
 * theme within reach. Welcome and sign-in share one split: on the gray canvas,
 * the concepts (first visit), a small brand area (returning), or the camera,
 * and a 420px white column that swaps between the methods. Setup is the step
 * list beside a 760px form column.
 */
export function OnboardingDesk({
  step,
  redirectTo,
}: {
  step: OnboardingStep;
  redirectTo?: string;
}) {
  if (step === "welcome") {
    return (
      <SignInSplit
        left={
          <div className="@container grid min-h-0 content-start gap-7 overflow-y-auto p-12">
            <ConceptGrid />
          </div>
        }
        right={<WelcomeActions redirectTo={redirectTo} />}
      />
    );
  }
  if (step === "signin") {
    return <SignInDesk redirectTo={redirectTo} context={<SignInContext />} />;
  }
  return <SetupDesk step={step} redirectTo={redirectTo} />;
}

/**
 * What a returning member sees beside the sign-in methods: the same guide the
 * welcome lays out, under a brand line rather than a second page heading —
 * "Welcome back" in the sign-in column is the page's one h1.
 */
function SignInContext() {
  const { i18n } = useLingui();
  const [intro] = introductionSlides;

  return (
    <div className="@container grid min-h-0 content-start gap-7 overflow-y-auto p-12">
      <div className="flex min-w-0 items-center gap-3">
        <CLCLogo className="size-10 shrink-0" sharp />
        {intro ? <p className="font-heading text-lg font-bold">{i18n._(intro.title)}</p> : null}
      </div>
      <ConceptCards />
    </div>
  );
}

function ConceptGrid() {
  const { i18n } = useLingui();
  const [intro] = introductionSlides;
  if (!intro) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* The one page-level heading on the first welcome; the cards are h2. */}
        <h1 className="max-w-[18ch] font-heading text-[1.75rem] font-bold leading-tight">
          {i18n._(intro.title)}
        </h1>
        <p className="max-w-[56ch] text-muted-foreground">{i18n._(intro.body)}</p>
      </div>
      <ConceptCards />
    </>
  );
}

function WelcomeActions({ redirectTo }: { redirectTo?: string }) {
  const navigate = useNavigate();

  function go(next: "profile" | "signin") {
    completeIntroduction();
    void navigate({ to: "/onboarding", search: onboardingSearch(next, redirectTo) });
  }

  return (
    // Centred in its own column, the way a console's sign-in sits: the brand,
    // the two ways in, then the two doors that need no account.
    <div className="m-auto grid w-full gap-3 py-6">
      <CLCLogo className="mx-auto mb-4 size-12 shrink-0" sharp />
      <Button className="w-full" onClick={() => go("profile")}>
        <Trans>Create account</Trans>
      </Button>
      <Button variant="outline" className="w-full" onClick={() => go("signin")}>
        <Trans>I already have an account</Trans>
      </Button>
      <div className="mt-4 grid grid-cols-2 gap-4 border-border border-t pt-4">
        <Button
          variant="ghost"
          className="min-w-0"
          onClick={() => {
            completeIntroduction();
            void navigate({ to: "/" });
          }}
        >
          <RiMap2Line aria-hidden="true" />
          <Trans>Market</Trans>
        </Button>
        <InstallAppButton quiet />
      </div>
    </div>
  );
}
