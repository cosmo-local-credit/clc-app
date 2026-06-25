import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SendAmountPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/send/amount")({
  component: SendAmountRoute,
});

function SendAmountRoute() {
  return (
    <AuthenticatedRoute>
      <SendAmountPage />
    </AuthenticatedRoute>
  );
}
