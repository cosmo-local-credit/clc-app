import { Trans, useLingui } from "@lingui/react/macro";

import { SignInPanel } from "#/components/auth/sign-in-panel";
import { OnboardingMenu } from "#/components/language-selector";
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
    <div className="relative flex min-h-[100svh] flex-col bg-background">
      <OnboardingMenu />
      <div className="flex flex-1 flex-col px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <BackChevron
          label={t`Back`}
          to="/onboarding"
          search={onboardingSearch("welcome", redirectTo)}
          className="mb-4 self-start"
        />

        <div className="mb-6">
          <h1 className="font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>Welcome back</Trans>
          </h1>
        </div>

        <SignInPanel
          redirectTo={redirectTo}
          // Session already invalidated in the panel; route-level exit drains history.
          onAuthenticated={() => {}}
          createAccountStep="profile"
        />
      </div>
    </div>
  );
}
