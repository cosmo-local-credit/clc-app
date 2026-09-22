import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { generatePrivateKey } from "viem/accounts";

import { isPasskeyPlatformAvailable } from "#/features/webauthn/hooks/use-platform-passkey-label";
import {
  onboardingSearch,
  type OnboardingStep,
  type WalletMethodChoice,
} from "#/lib/onboarding-search";
import { OnboardingMethodStep } from "./onboarding-method-step";
import { OnboardingProfileForm } from "./onboarding-profile-form";

const OnboardingWalletStep = lazy(() =>
  import("./onboarding-wallet-step").then((module) => ({
    default: module.OnboardingWalletStep,
  })),
);

type Props = {
  step: Extract<OnboardingStep, "profile" | "method" | "card">;
  redirectTo?: string;
};

function profileFingerprint(profile: ProfileInput): string {
  return JSON.stringify({
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    preferredCurrency: profile.preferredCurrency,
    bio: profile.bio,
    website: profile.website,
  });
}

/**
 * Signup half of onboarding (screens C → D → E).
 *
 * Steps are **pushed** into history so screen Back and native/browser Back
 * both use `history.back()`. Successful exit drains intermediate onboarding
 * entries via {@link exitOnboarding}.
 *
 * The paper-wallet private key is owned here so remounting the card step
 * cannot mint a second key after backend signup already bound the first one.
 */
export function OnboardingFlow({ step, redirectTo }: Props) {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState<ProfileInput | null>(null);
  /**
   * The chosen profile photo, held until an account exists.
   *
   * It cannot be uploaded from the profile step: the upload service wants a
   * clc-core session token and there is no session until the wallet step
   * registers the account. Kept out of ProfileInput because that schema is
   * shared with @clc/core, which cannot name a File.
   */
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [walletMethod, setWalletMethod] = useState<WalletMethodChoice | null>(null);
  /** Fingerprint of the profile last successfully registered for this key. */
  const [registeredProfileFp, setRegisteredProfileFp] = useState<string | null>(null);
  const [passkeyAvailable] = useState(() => isPasskeyPlatformAvailable());
  const privateKeyRef = useRef<`0x${string}` | null>(null);

  function ensurePrivateKey(): `0x${string}` {
    if (!privateKeyRef.current) privateKeyRef.current = generatePrivateKey();
    return privateKeyRef.current;
  }

  /** Push the next step so Back walks the real history stack. */
  const go = useCallback(
    (next: OnboardingStep) => {
      void navigate({
        to: "/onboarding",
        search: onboardingSearch(next, redirectTo),
      });
    },
    [navigate, redirectTo],
  );

  /** Guards use replace so deep links / capability skips do not inflate the stack. */
  const goReplace = useCallback(
    (next: OnboardingStep) => {
      void navigate({
        to: "/onboarding",
        search: onboardingSearch(next, redirectTo),
        replace: true,
      });
    },
    [navigate, redirectTo],
  );

  /**
   * Wallet step has invalidated the session query. Navigation is owned by the
   * onboarding route's authenticated effect so we never double-exit history.
   */
  function finish() {
    // no-op: route exitOnboarding runs when isAuthenticated flips
  }

  // Method / card require a completed profile and photo. Deep links land on profile.
  useEffect(() => {
    if ((step === "method" || step === "card") && (!profileData || !avatarFile)) {
      goReplace("profile");
    }
  }, [step, profileData, avatarFile, goReplace]);

  // Skip method when the platform cannot store passkeys.
  useEffect(() => {
    if (step === "method" && profileData && avatarFile && !passkeyAvailable) {
      setWalletMethod("paper");
      goReplace("card");
    }
  }, [step, profileData, avatarFile, passkeyAvailable, goReplace]);

  if (step === "method" && profileData && avatarFile && passkeyAvailable) {
    return (
      <OnboardingMethodStep
        redirectTo={redirectTo}
        initialChoice={walletMethod ?? "link"}
        onContinue={(choice) => {
          setWalletMethod(choice);
          ensurePrivateKey();
          go("card");
        }}
      />
    );
  }

  if (step === "card" && profileData && avatarFile) {
    const totalSteps = passkeyAvailable ? 3 : 2;
    const progressStep = passkeyAvailable ? 3 : 2;
    const linkPasskey = passkeyAvailable && walletMethod !== "paper";
    const privateKey = ensurePrivateKey();
    const currentFp = profileFingerprint(profileData);
    const backendRegistered = registeredProfileFp === currentFp;

    return (
      <Suspense fallback={<OnboardingStepFallback />}>
        <OnboardingWalletStep
          profileData={profileData}
          avatarFile={avatarFile}
          privateKey={privateKey}
          backendRegistered={backendRegistered}
          onBackendRegistered={() => setRegisteredProfileFp(currentFp)}
          redirectTo={redirectTo}
          progressStep={progressStep}
          progressTotal={totalSteps}
          linkPasskey={linkPasskey}
          onDone={finish}
        />
      </Suspense>
    );
  }

  return (
    <OnboardingProfileForm
      redirectTo={redirectTo}
      progressStep={1}
      progressTotal={passkeyAvailable ? 3 : 2}
      initialValues={profileData ?? undefined}
      initialAvatarFile={avatarFile}
      onNext={(data, nextAvatarFile) => {
        // Edited profile after a prior signup must be re-persisted. A newly
        // chosen photo is an edit too: signup is what uploads it.
        const fingerprintChanged =
          registeredProfileFp && registeredProfileFp !== profileFingerprint(data);
        if (fingerprintChanged || nextAvatarFile !== avatarFile) {
          setRegisteredProfileFp(null);
        }
        setProfileData(data);
        setAvatarFile(nextAvatarFile);
        if (passkeyAvailable) {
          go("method");
        } else {
          setWalletMethod("paper");
          ensurePrivateKey();
          go("card");
        }
      }}
    />
  );
}

function OnboardingStepFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
