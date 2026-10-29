import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { voucherReceiptSearchSchema } from "#/features/vouchers/receipt-search";
import { VoucherDeploymentReceiptPage } from "#/features/vouchers/ui";

const VoucherReceiptDesk = lazy(() =>
  import("#/desktop/vouchers/voucher-receipt-desk").then((module) => ({
    default: module.VoucherReceiptDesk,
  })),
);

export const Route = createFileRoute("/vouchers/create/receipt")({
  staticData: { desktop: "fill" },
  validateSearch: voucherReceiptSearchSchema,
  component: VoucherDeploymentReceiptRoute,
});

function VoucherDeploymentReceiptRoute() {
  const { trackingId, mintTrackingId, mintAmount } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={
          <VoucherDeploymentReceiptPage
            trackingId={trackingId}
            mintTrackingId={mintTrackingId}
            mintAmount={mintAmount}
          />
        }
        desktop={
          <VoucherReceiptDesk
            trackingId={trackingId}
            mintTrackingId={mintTrackingId}
            mintAmount={mintAmount}
          />
        }
      />
    </AuthenticatedRoute>
  );
}
