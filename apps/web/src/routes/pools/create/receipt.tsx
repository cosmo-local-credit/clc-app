import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PoolDeploymentReceiptPage } from "#/features/pools/ui";

const searchSchema = z.object({
  trackingId: z.string().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/pools/create/receipt")({
  validateSearch: searchSchema,
  component: PoolDeploymentReceiptRoute,
});

function PoolDeploymentReceiptRoute() {
  const { trackingId } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <PoolDeploymentReceiptPage trackingId={trackingId} />
    </AuthenticatedRoute>
  );
}
