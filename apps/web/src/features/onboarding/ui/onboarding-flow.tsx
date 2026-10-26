import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { generatePrivateKey } from "viem/accounts";

import { isPasskeyPlatformAvailable } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { onboardingSearch, type OnboardingStep } from "#/lib/onboarding-search";
import { OnboardingProfileForm } from "./onboarding-profile-form";

const OnboardingWalletStep = lazy(() =>
  import("./onboarding-wallet-step").then((module) => ({
    default: module.OnboardingWalletStep,
  })),
);

type Props = {
  step: Extract<OnboardingStep, "profile" | "contact" | "location" | "card" | "save" | "link">;
  redirectTo?: string;
  /** Hides the phone frame. Off by default, so the phone render stays as it is. */
  embedded?: boolean;
};

function profileFingerprint(profile: ProfileInput): string {
  return JSON.stringify({
    name: profile.name,
    username: profile.username,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    preferredCurrency: profile.preferredCurrency,
    bio: profile.bio,
    website: profile.website,
  });
}

/**
 * Signup half of onboarding: the profile's three pages, then the paper
 * wallet's three (protect, save, link).
 *
 * Steps are **pushed** into history so screen Back and native/browser Back
 * both use `history.back()`. Successful exit drains intermediate onboarding
 * entries via {@link exitOnboarding}.
 *
 * The paper-wallet private key is owned here so remounting the card step
 * cannot mint a second key after backend signup already bound the first one.
 */
export function OnboardingFlow({ step, redirectTo, embedded = false }: Props) {
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

  const walletPage = step === "card" || step === "save" || step === "link" ? step : null;

  // The wallet pages require a completed profile and photo. Deep links land on profile.
  useEffect(() => {
    if (walletPage && (!profileData || !avatarFile)) goReplace("profile");
  }, [walletPage, profileData, avatarFile, goReplace]);

  // Link offers a passkey, which this platform cannot store.
  useEffect(() => {
    if (step === "link" && !passkeyAvailable) goReplace("save");
  }, [step, passkeyAvailable, goReplace]);

  if (walletPage && profileData && avatarFile) {
    const privateKey = ensurePrivateKey();
    const currentFp = profileFingerprint(profileData);
    const backendRegistered = registeredProfileFp === currentFp;

    // One element for the three pages, so the password, the saved card and
    // any signup in progress survive moving between them.
    return (
      <Suspense fallback={<OnboardingStepFallback />}>
        <OnboardingWalletStep
          page={walletPage}
          onPage={go}
          onReplace={goReplace}
          profileData={profileData}
          avatarFile={avatarFile}
          privateKey={privateKey}
          backendRegistered={backendRegistered}
          onBackendRegistered={() => setRegisteredProfileFp(currentFp)}
          redirectTo={redirectTo}
          progressTotal={passkeyAvailable ? 6 : 5}
          linkPasskey={passkeyAvailable}
          onDone={finish}
          embedded={embedded}
        />
      </Suspense>
    );
  }

  // One element for all three pages, so the form keeps its values as they change.
  return (
    <OnboardingProfileForm
      page={step === "contact" || step === "location" ? step : "profile"}
      redirectTo={redirectTo}
      progressTotal={passkeyAvailable ? 6 : 5}
      initialValues={profileData ?? undefined}
      initialAvatarFile={avatarFile}
      onPage={go}
      onRestart={() => goReplace("profile")}
      embedded={embedded}
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
        ensurePrivateKey();
        go("card");
      }}
    />
  );
}

function OnboardingStepFallback() {
  return <div className="min-h-[100svh] bg-background" />;
}
