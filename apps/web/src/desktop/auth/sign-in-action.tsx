import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { canReachPrivateRoutes } from "#/features/auth/logic/private-routes";
import { onboardingSearch } from "#/lib/onboarding-search";

/**
 * A guest's way in, in the shell's top-right corner: the top bar on every
 * screen that has one, and over the map on the one that does not. It draws
 * nothing while the session is still being checked, so a returning member
 * never sees it flash, and nothing at all once they are in.
 */
export function DeskSignInAction() {
  const auth = useAuthStatus();
  if (canReachPrivateRoutes(auth)) return null;
  return (
    <Button asChild>
      <Link to="/onboarding" search={onboardingSearch("welcome")}>
        <Trans>Sign in</Trans>
      </Link>
    </Button>
  );
}
