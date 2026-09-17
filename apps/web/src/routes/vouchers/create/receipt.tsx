import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { voucherReceiptSearchSchema } from "#/features/vouchers/receipt-search";
import { VoucherDeploymentReceiptPage } from "#/features/vouchers/ui";

export const Route = createFileRoute("/vouchers/create/receipt")({
  validateSearch: voucherReceiptSearchSchema,
  component: VoucherDeploymentReceiptRoute,
});

function VoucherDeploymentReceiptRoute() {
  const { trackingId, mintTrackingId, mintAmount } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <VoucherDeploymentReceiptPage
        trackingId={trackingId}
        mintTrackingId={mintTrackingId}
        mintAmount={mintAmount}
      />
    </AuthenticatedRoute>
  );
}
