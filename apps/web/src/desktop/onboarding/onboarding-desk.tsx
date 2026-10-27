import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import type { IconType } from "react-icons";
import {
  RiArrowLeftDownLine,
  RiArrowRightUpLine,
  RiBubbleChartLine,
  RiCouponLine,
  RiLayoutGridLine,
  RiMap2Line,
  RiWallet3Line,
} from "react-icons/ri";

import { InstallAppButton } from "#/components/install-app-button";
import type { GuideArtName } from "#/components/introduction/guide-art";
import { introductionSlides } from "#/components/introduction/introduction-content";
import { completeIntroduction } from "#/components/introduction/introduction-state";
import { Button } from "#/components/ui/button";
import { CLCLogo } from "#/components/ui/clc-logo";
import { onboardingSearch, type OnboardingStep } from "#/lib/onboarding-search";
import { SetupDesk } from "./setup-desk";
import { SignInDesk, SignInSplit } from "./sign-in-desk";
import { cn } from "#/lib/utils";

/**
 * Onboarding without the app shell. Welcome and sign-in share one split: the
 * concepts (or the camera) on the gray canvas and a 420px white column that
 * swaps between the two. Setup is the step list beside a 760px form column.
 */
export function OnboardingDesk({
  step,
  redirectTo,
}: {
  step: OnboardingStep;
  redirectTo?: string;
}) {
  const concepts = (
    <div className="grid min-h-0 content-start gap-7 overflow-y-auto p-12">
      <Brand />
      <ConceptGrid />
    </div>
  );
  if (step === "welcome") {
    return <SignInSplit left={concepts} right={<WelcomeActions redirectTo={redirectTo} />} />;
  }
  if (step === "signin") return <SignInDesk redirectTo={redirectTo} concepts={concepts} />;
  return <SetupDesk step={step} redirectTo={redirectTo} />;
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <CLCLogo className="size-6 shrink-0" sharp />
      <span className="font-heading text-lg font-bold">CLC</span>
    </div>
  );
}

const CONCEPT_ICONS: Partial<Record<GuideArtName, { icon: IconType; className?: string }>> = {
  voucher: { icon: RiCouponLine, className: "text-voucher-ink" },
  offer: { icon: RiLayoutGridLine, className: "text-voucher-ink" },
  pool: { icon: RiBubbleChartLine, className: "text-pool-ink" },
  send: { icon: RiArrowRightUpLine },
  receive: { icon: RiArrowLeftDownLine },
  wallet: { icon: RiWallet3Line },
};

function ConceptGrid() {
  const { i18n } = useLingui();
  const [intro, ...concepts] = introductionSlides;
  if (!intro) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="max-w-[18ch] font-heading text-[1.75rem] font-bold leading-tight">
          {i18n._(intro.title)}
        </h1>
        <p className="max-w-[56ch] text-muted-foreground">{i18n._(intro.body)}</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {concepts.map((concept) => {
          const art = CONCEPT_ICONS[concept.art];
          return (
            <div key={concept.art} className="border border-border bg-card p-4">
              {art ? <art.icon className={cn("size-5", art.className)} aria-hidden="true" /> : null}
              <h2 className="mt-2.5 font-heading text-base font-semibold">
                {i18n._(concept.title)}
              </h2>
              <p className="mt-1.5 text-muted-foreground text-sm">{i18n._(concept.body)}</p>
            </div>
          );
        })}
      </div>
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
    <>
      <Button className="w-full" onClick={() => go("profile")}>
        <Trans>Create account</Trans>
      </Button>
      <Button variant="outline" className="w-full" onClick={() => go("signin")}>
        <Trans>I already have an account</Trans>
      </Button>
      <div className="mt-2 grid grid-cols-2 gap-4">
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
    </>
  );
}
