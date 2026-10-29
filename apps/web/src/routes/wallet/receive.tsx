import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { ReceivePage } from "#/features/wallet/ui";

const ReceiveDesk = lazy(() =>
  import("#/desktop/wallet/receive-desk").then((module) => ({ default: module.ReceiveDesk })),
);

export const Route = createFileRoute("/wallet/receive")({
  staticData: { desktop: "fill" },
  component: ReceiveRoute,
});

function ReceiveRoute() {
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<ReceivePage />} desktop={<ReceiveDesk />} />
    </AuthenticatedRoute>
  );
}
