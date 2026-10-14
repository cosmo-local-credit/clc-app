import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CashPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/cash")({
  component: CashRoute,
});

function CashRoute() {
  return (
    <AuthenticatedRoute>
      <CashPage />
    </AuthenticatedRoute>
  );
}
