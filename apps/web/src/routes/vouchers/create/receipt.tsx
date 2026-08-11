import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { VoucherDeploymentReceiptPage } from "#/features/vouchers/ui";

const searchSchema = z.object({
  trackingId: z.string().min(1).optional().catch(undefined),
  mintTrackingId: z.string().min(1).optional().catch(undefined),
  mintAmount: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/vouchers/create/receipt")({
  validateSearch: searchSchema,
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
