import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { onboardingSearch } from "#/lib/onboarding-search";
import { cn } from "#/lib/utils";
import { sanitizeInternalRedirect } from "./redirect";

const LINK_CLASS =
  "font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

/**
 * Inline protection for a detail section on an otherwise public resource.
 * Children are deliberately not mounted until clc-core has verified a user
 * session, preventing their private queries and contact UI from running for a
 * visitor or while the session check is unresolved.
 */
export function AuthenticatedDetailsGate({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { t } = useLingui();
  const auth = useAuthStatus();
  const redirectTo = sanitizeInternalRedirect(
    typeof window === "undefined"
      ? undefined
      : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );

  if (auth.isAuthenticated) return <>{children}</>;

  if (auth.isLoading) {
    return (
      <div
        aria-busy="true"
        aria-label={t`Checking your session…`}
        className={cn("space-y-2", className)}
      >
        <Skeleton className="h-4 w-2/3 rounded-none" />
        <Skeleton className="h-4 w-1/2 rounded-none" />
      </div>
    );
  }

  if (auth.state === "sessionCheckError") {
    return (
      <div role="alert" className={cn("space-y-3 text-sm", className)}>
        <p>
          <Trans>We could not verify your session.</Trans>
        </p>
        <Button variant="outline" tap pending={auth.retrying} onClick={auth.retry}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  return (
    <p className={cn("text-muted-foreground text-sm", className)}>
      <Trans>
        <Link
          to="/onboarding"
          search={onboardingSearch("signin", redirectTo)}
          replace
          className={LINK_CLASS}
        >
          Sign in
        </Link>{" "}
        for more information.
      </Trans>
    </p>
  );
}
