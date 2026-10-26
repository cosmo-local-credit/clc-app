import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { PoolDeploymentReceiptPage } from "#/features/pools/ui";

const PoolReceiptDesk = lazy(() =>
  import("#/desktop/pools/pool-receipt-desk").then((module) => ({
    default: module.PoolReceiptDesk,
  })),
);

const searchSchema = z.object({
  trackingId: z.string().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/pools/create/receipt")({
  staticData: { desktop: "fill" },
  validateSearch: searchSchema,
  component: PoolDeploymentReceiptRoute,
});

function PoolDeploymentReceiptRoute() {
  const { trackingId } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<PoolDeploymentReceiptPage trackingId={trackingId} />}
        desktop={<PoolReceiptDesk trackingId={trackingId} />}
      />
    </AuthenticatedRoute>
  );
}
