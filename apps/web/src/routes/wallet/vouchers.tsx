import { createFileRoute } from "@tanstack/react-router";

import { AllVouchersPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/vouchers")({
  component: AllVouchersRoute,
});

function AllVouchersRoute() {
  return <AllVouchersPage />;
}
