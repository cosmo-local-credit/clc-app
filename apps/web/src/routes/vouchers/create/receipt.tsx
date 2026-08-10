import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { VoucherDeploymentReceiptPage } from "#/features/vouchers/ui";

const searchSchema = z.object({
  trackingId: z.string().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/vouchers/create/receipt")({
  validateSearch: searchSchema,
  component: VoucherDeploymentReceiptRoute,
});

function VoucherDeploymentReceiptRoute() {
  const { trackingId } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <VoucherDeploymentReceiptPage trackingId={trackingId} />
    </AuthenticatedRoute>
  );
}
