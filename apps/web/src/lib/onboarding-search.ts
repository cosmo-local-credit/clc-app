import { sanitizeInternalRedirect } from "#/components/auth/redirect";

const ONBOARDING_STEPS = [
  "welcome",
  "signin",
  "profile",
  "contact",
  "location",
  "method",
  "card",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The three pages of Create account, one form across them. */
export type ProfilePage = Extract<OnboardingStep, "profile" | "contact" | "location">;

export type OnboardingSearch = {
  redirect?: string;
  step: OnboardingStep;
};

export type WalletMethodChoice = "link" | "paper";

function parseOnboardingStep(value: unknown): OnboardingStep {
  if (typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value)) {
    return value as OnboardingStep;
  }
  return "welcome";
}

export function parseOnboardingSearch(search: Record<string, unknown>): OnboardingSearch {
  return {
    redirect: sanitizeInternalRedirect(search.redirect),
    step: parseOnboardingStep(search.step),
  };
}

/**
 * Build onboarding search while preserving redirect intent.
 * Always drops self-referential onboarding destinations (via sanitize).
 */
export function onboardingSearch(step: OnboardingStep, redirectTo?: string): OnboardingSearch {
  const redirect = sanitizeInternalRedirect(redirectTo);
  return redirect ? { step, redirect } : { step };
}
