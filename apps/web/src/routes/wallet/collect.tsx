import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { CollectPage } from "#/features/wallet/ui";

const CollectDesk = lazy(() =>
  import("#/desktop/wallet/collect-desk").then((module) => ({ default: module.CollectDesk })),
);

const searchSchema = z.object({
  /** Contract address of the voucher to preselect. */
  token: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/wallet/collect")({
  staticData: { desktop: "fill" },
  validateSearch: searchSchema,
  component: CollectRoute,
});

function CollectRoute() {
  const { token } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <LayoutSwitch mobile={<CollectPage token={token} />} desktop={<CollectDesk />} />
    </AuthenticatedRoute>
  );
}
