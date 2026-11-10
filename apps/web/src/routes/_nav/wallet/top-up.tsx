import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { validateTopUpSearch } from "#/features/wallet/top-up-search";
import { TopUpPage } from "#/features/wallet/ui";

const TopUpDesk = lazy(() =>
  import("#/desktop/wallet/top-up-desk").then((module) => ({ default: module.TopUpDesk })),
);

export const Route = createFileRoute("/_nav/wallet/top-up")({
  staticData: { navOwner: "wallet", desktop: "fill" },
  // The open ramp form in either view, or a history row in the desktop inspector.
  validateSearch: validateTopUpSearch,
  component: TopUpRoute,
});

function TopUpRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<TopUpPage />} desktop={<TopUpDesk />} />
    </AuthenticatedRoute>
  );
}
