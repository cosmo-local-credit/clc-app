import { Trans, useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { marketplaceSharedSearch } from "#/lib/navigation/marketplace-search";
import { onboardingSearch } from "#/lib/onboarding-search";

const LINK_CLASS =
  "whitespace-nowrap font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

export function MarketEmptyMessage({ surface = "list" }: { surface?: "map" | "list" }) {
  const auth = useAuthStatus();
  if (auth.isAuthenticated) {
    return (
      <Trans>
        No marketplace results to show yet, visit your{" "}
        <Link to="/" search={{ tab: "wallet" }} className={LINK_CLASS}>
          Wallet
        </Link>{" "}
        to list a resource in this <EmptyLocation surface={surface}>location</EmptyLocation>.
      </Trans>
    );
  }
  if (auth.isLoading || auth.state === "sessionCheckError") {
    return <Trans>No marketplace results to show yet.</Trans>;
  }
  return (
    <Trans>
      No marketplace results to show yet,{" "}
      <Link
        to="/onboarding"
        search={onboardingSearch("signin", "/?tab=wallet")}
        className={LINK_CLASS}
      >
        Sign in
      </Link>{" "}
      to list a resource in this <EmptyLocation surface={surface}>location</EmptyLocation>.
    </Trans>
  );
}

function EmptyLocation({ surface, children }: { surface: "map" | "list"; children: ReactNode }) {
  const { t } = useLingui();
  if (surface === "map") return <>{children}</>;
  return (
    <Link
      to="/"
      search={(previous) => ({ ...marketplaceSharedSearch(previous), tab: "market", view: "map" })}
      className={LINK_CLASS}
      aria-label={t`View this location on the map`}
    >
      {children}
    </Link>
  );
}
