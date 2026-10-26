import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { CashPage } from "#/features/wallet/ui";

const CashDesk = lazy(() =>
  import("#/desktop/wallet/cash-desk").then((module) => ({ default: module.CashDesk })),
);

export const Route = createFileRoute("/wallet/cash")({
  staticData: { desktop: "fill" },
  component: CashRoute,
});

function CashRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<CashPage />} desktop={<CashDesk />} />
    </AuthenticatedRoute>
  );
}
