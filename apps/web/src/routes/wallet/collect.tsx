import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CollectPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  /** Contract address of the voucher to preselect. */
  token: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/wallet/collect")({
  validateSearch: searchSchema,
  component: CollectRoute,
});

function CollectRoute() {
  const { token } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <CollectPage token={token} />
    </AuthenticatedRoute>
  );
}
