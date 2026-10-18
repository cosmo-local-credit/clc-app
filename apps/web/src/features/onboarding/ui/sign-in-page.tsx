import { Trans, useLingui } from "@lingui/react/macro";

import { SignInPanel } from "#/components/auth/sign-in-panel";
import { OnboardingScreen, OnboardingTitle } from "#/components/onboarding-screen";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { onboardingSearch } from "#/lib/onboarding-search";

/**
 * Screen B — Sign-in methods for returning users. Back uses history.back()
 * when possible (via BackChevron), matching browser/Android back.
 *
 * After authentication the session invalidation in SignInPanel flips
 * `useAuthStatus`; the onboarding route owns the single history exit.
 */
export function SignInPage({ redirectTo }: { redirectTo?: string }) {
  const { t } = useLingui();

  return (
    <OnboardingScreen
      start={
        <BackChevron
          label={t`Back`}
          to="/onboarding"
          search={onboardingSearch("welcome", redirectTo)}
        />
      }
    >
      <OnboardingTitle>
        <Trans>Welcome back</Trans>
      </OnboardingTitle>
      <SignInPanel
        redirectTo={redirectTo}
        // Session already invalidated in the panel; route-level exit drains history.
        onAuthenticated={() => {}}
        createAccountStep="profile"
      />
    </OnboardingScreen>
  );
}
