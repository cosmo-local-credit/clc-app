import { lazy, Suspense } from "react";

import { type SetupStep, useOnboardingFlow } from "#/features/onboarding/hooks/use-onboarding-flow";
import { OnboardingProfileForm } from "./onboarding-profile-form";

const OnboardingWalletStep = lazy(() =>
  import("./onboarding-wallet-step").then((module) => ({
    default: module.OnboardingWalletStep,
  })),
);

type Props = {
  step: SetupStep;
  redirectTo?: string;
};

/** The phone's signup: the profile's three pages, then the paper wallet's three. */
export function OnboardingFlow({ step, redirectTo }: Props) {
  const { go, passkeyAvailable, progressTotal, wallet, profile } = useOnboardingFlow({
    step,
    redirectTo,
  });

  if (wallet) {
    // One element for the three pages, so the password, the saved card and
    // any signup in progress survive moving between them.
    return (
      <Suspense fallback={<OnboardingStepFallback />}>
        <OnboardingWalletStep
          {...wallet}
          onPage={go}
          redirectTo={redirectTo}
          progressTotal={progressTotal}
          linkPasskey={passkeyAvailable}
        />
      </Suspense>
    );
  }

  // One element for all three pages, so the form keeps its values as they change.
  return (
    <OnboardingProfileForm
      {...profile}
      redirectTo={redirectTo}
      progressTotal={progressTotal}
      onPage={go}
    />
  );
}

function OnboardingStepFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
