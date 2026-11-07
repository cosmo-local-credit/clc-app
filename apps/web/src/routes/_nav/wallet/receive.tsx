import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { ReceivePage } from "#/features/wallet/ui";

export const Route = createFileRoute("/_nav/wallet/receive")({
  staticData: { navOwner: "wallet" },
  component: ReceiveRoute,
});

function ReceiveRoute() {
  return (
    <AuthenticatedRoute>
      <ReceivePage />
    </AuthenticatedRoute>
  );
}
