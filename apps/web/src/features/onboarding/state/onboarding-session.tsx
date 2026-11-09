import type { ProfileInput } from "@clc/core/features/signup/logic";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createStore, type StoreApi } from "zustand";

import type { OnboardingProfileDraft } from "#/features/onboarding/hooks/use-onboarding-profile";
import type { OnboardingStep } from "#/lib/onboarding-search";

/**
 * Everything signup has gathered so far, owned by the /onboarding route.
 *
 * The phone flow and the desktop setup are two views of one signup. A layout
 * switch (a resize, or snapping a window to half a 1920px screen) unmounts one
 * and mounts the other, so state held in either view would be lost with it,
 * and a new paper-wallet key minted after the backend had registered the
 * first. The route itself does not remount on a switch, so a store it provides
 * outlives both views and dies with the visit.
 *
 * View drafts cannot do this job and must not: signup is a guest's, and it
 * carries a private key and a photo, all three of which they refuse by design.
 *
 * Memory only: no `persist`, no `devtools`, and one store per visit rather than
 * a module-level one, so nothing here can be read outside the route.
 */
export type OnboardingSession = {
  /** The submitted profile, once its last page passes. */
  profileData: ProfileInput | null;
  /** The chosen photo; uploaded by signup, since there is no session before it. */
  avatarFile: File | null;
  /** Fingerprint of the profile last registered for this key. */
  registeredProfileFp: string | null;
  /** The paper wallet's key, minted once per visit. */
  privateKey: `0x${string}` | null;
  /** The profile form as typed, before its last page submits it. */
  profileDraft: OnboardingProfileDraft | null;
  /** A passkey was registered; Link retries the connection only. */
  passkeyRegistered: boolean;
};

const INITIAL: OnboardingSession = {
  profileData: null,
  avatarFile: null,
  registeredProfileFp: null,
  privateKey: null,
  profileDraft: null,
  passkeyRegistered: false,
};

const OnboardingSessionContext = createContext<StoreApi<OnboardingSession> | null>(null);

/** Steps outside signup. Reaching one in place leaves the signup, so it starts over. */
const OUTSIDE_SIGNUP: ReadonlySet<OnboardingStep> = new Set(["welcome", "signin"]);

export function OnboardingSessionProvider({
  step,
  children,
}: {
  step: OnboardingStep;
  children: ReactNode;
}) {
  const [store] = useState(() => createStore<OnboardingSession>(() => INITIAL));
  // Leaving signup for the welcome or sign-in screens drops what it gathered,
  // as unmounting the flow always did. A layout switch keeps the step, so it
  // keeps the signup.
  useEffect(() => {
    if (OUTSIDE_SIGNUP.has(step)) store.setState(INITIAL, true);
  }, [step, store]);
  return (
    <OnboardingSessionContext.Provider value={store}>{children}</OnboardingSessionContext.Provider>
  );
}

/**
 * The route's store, or one of this caller's own when rendered without the
 * route (a test, a story): then the state lives and dies with the caller, as it
 * did before the route owned it.
 */
export function useOnboardingSessionStore(): StoreApi<OnboardingSession> {
  const provided = useContext(OnboardingSessionContext);
  const [own] = useState(() => (provided ? null : createStore<OnboardingSession>(() => INITIAL)));
  const store = provided ?? own;
  if (!store) throw new Error("useOnboardingSessionStore: no store");
  return store;
}
