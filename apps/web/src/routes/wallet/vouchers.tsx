import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { AllVouchersPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/vouchers")({
  component: AllVouchersRoute,
});

function AllVouchersRoute() {
  return (
    <AuthenticatedRoute>
      <AllVouchersPage />
    </AuthenticatedRoute>
  );
}
