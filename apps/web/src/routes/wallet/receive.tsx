import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { ReceivePage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/receive")({
  component: ReceiveRoute,
});

function ReceiveRoute() {
  return (
    <AuthenticatedRoute>
      <ReceivePage />
    </AuthenticatedRoute>
  );
}
