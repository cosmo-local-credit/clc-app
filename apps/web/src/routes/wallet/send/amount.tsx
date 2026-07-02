import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SendAmountPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  /** Contract address of the token to preselect. */
  token: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/wallet/send/amount")({
  validateSearch: searchSchema,
  component: SendAmountRoute,
});

function SendAmountRoute() {
  const { token } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <SendAmountPage token={token} />
    </AuthenticatedRoute>
  );
}
