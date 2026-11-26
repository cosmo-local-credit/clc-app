import { isRegionalAdminRole } from "@clc/core/features/users/roles";
import { Trans, useLingui } from "@lingui/react/macro";
import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { MyRegions } from "#/components/regions/my-regions";
import { BackChevron } from "#/components/wallet/wallet-layout";
import { LayoutSwitch } from "#/desktop/switch";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";

const MyRegionsDesk = lazy(() =>
  import("#/desktop/account/my-regions-desk").then(({ MyRegionsDesk }) => ({
    default: MyRegionsDesk,
  })),
);

export const Route = createFileRoute("/_nav/settings/regions")({
  staticData: { navOwner: "settings", desktop: "fill" },
  component: MyRegionsRoute,
});

function MyRegionsRoute() {
  return (
    <AuthenticatedRoute>
      <MyRegionsViews />
    </AuthenticatedRoute>
  );
}

function MyRegionsViews() {
  const { t } = useLingui();
  const { isAuthenticated, session } = useAuthStatus();
  // The endpoint rechecks the current assignment. The role controls only this entry point.
  const viewer =
    isAuthenticated && isRegionalAdminRole(session?.role) ? session?.address : undefined;
  return (
    <LayoutSwitch
      mobile={
        <main className="min-h-[100svh] bg-background px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-bottom-nav">
          <BackChevron label={t`Settings`} to="/" search={{ tab: "settings" }} />
          <h1 className="mb-4 font-heading text-[1.75rem] font-bold leading-tight">
            <Trans>My regions</Trans>
          </h1>
          <MyRegions viewer={viewer} />
        </main>
      }
      desktop={<MyRegionsDesk viewer={viewer} />}
    />
  );
}
