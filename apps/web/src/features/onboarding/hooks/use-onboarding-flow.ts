import type { ProfileInput } from "@clc/core/features/signup/logic";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { generatePrivateKey } from "viem/accounts";

import { isPasskeyPlatformAvailable } from "#/features/webauthn/hooks/use-platform-passkey-label";
import { onboardingSearch, type OnboardingStep } from "#/lib/onboarding-search";

export type SetupStep = Extract<
  OnboardingStep,
  "profile" | "contact" | "location" | "card" | "save" | "link"
>;

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
 * entries via `exitOnboarding`.
 *
 * The paper-wallet private key is owned here so remounting the card step
 * cannot mint a second key after backend signup already bound the first one.
 * The phone flow and the desktop setup both run on this.
 */
export function useOnboardingFlow({ step, redirectTo }: { step: SetupStep; redirectTo?: string }) {
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

  const walletPage = step === "card" || step === "save" || step === "link" ? step : null;

  // The wallet pages require a completed profile and photo. Deep links land on profile.
  useEffect(() => {
    if (walletPage && (!profileData || !avatarFile)) goReplace("profile");
  }, [walletPage, profileData, avatarFile, goReplace]);

  // Link offers a passkey, which this platform cannot store.
  useEffect(() => {
    if (step === "link" && !passkeyAvailable) goReplace("save");
  }, [step, passkeyAvailable, goReplace]);

  const wallet =
    walletPage && profileData && avatarFile
      ? (() => {
          const currentFp = profileFingerprint(profileData);
          return {
            page: walletPage,
            profileData,
            avatarFile,
            privateKey: ensurePrivateKey(),
            backendRegistered: registeredProfileFp === currentFp,
            onBackendRegistered: () => setRegisteredProfileFp(currentFp),
            onReplace: goReplace,
            /**
             * Wallet step has invalidated the session query. Navigation is owned by the
             * onboarding route's authenticated effect so we never double-exit history.
             */
            onDone: () => {},
          };
        })()
      : null;

  return {
    go,
    goReplace,
    passkeyAvailable,
    progressTotal: passkeyAvailable ? 6 : 5,
    /** The wallet pages' inputs, once the profile and photo exist. */
    wallet,
    profile: {
      page: step === "contact" || step === "location" ? step : ("profile" as const),
      initialValues: profileData ?? undefined,
      initialAvatarFile: avatarFile,
      onRestart: () => goReplace("profile"),
      onNext: (data: ProfileInput, nextAvatarFile: File) => {
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
      },
    },
  };
}
