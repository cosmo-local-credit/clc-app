import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { TopUpPage } from "#/features/wallet/ui";

const TopUpDesk = lazy(() =>
  import("#/desktop/wallet/top-up-desk").then((module) => ({ default: module.TopUpDesk })),
);

export const Route = createFileRoute("/wallet/top-up")({
  staticData: { desktop: "fill" },
  component: TopUpRoute,
});

function TopUpRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<TopUpPage />} desktop={<TopUpDesk />} />
    </AuthenticatedRoute>
  );
}
