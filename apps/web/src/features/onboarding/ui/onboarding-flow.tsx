import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";

import { OnboardingProfileForm } from "./onboarding-profile-form";

const OnboardingWalletStep = lazy(() =>
  import("./onboarding-wallet-step").then((module) => ({
    default: module.OnboardingWalletStep,
  })),
);

type Step = "profile" | "wallet";

/**
 * Two-step onboarding flow:
 *   1. Profile form  — collects name, location, email/phone
 *   2. Wallet step   — generates paper wallet, optional Calibur+WebAuthn link
 *
 * The flow is disconnected-only; IndexPage handles already-connected users.
 */
export function OnboardingFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("profile");
  const [profileData, setProfileData] = useState<ProfileInput | null>(null);

  if (step === "wallet" && profileData) {
    return (
      <Suspense fallback={<OnboardingStepFallback />}>
        <OnboardingWalletStep
          profileData={profileData}
          onBack={() => setStep("profile")}
          onDone={() => {
            void navigate({ to: "/", replace: true });
          }}
        />
      </Suspense>
    );
  }

  return (
    <OnboardingProfileForm
      onNext={(data) => {
        setProfileData(data);
        setStep("wallet");
      }}
    />
  );
}

function OnboardingStepFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
