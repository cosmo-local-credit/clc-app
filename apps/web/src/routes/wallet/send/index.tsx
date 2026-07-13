import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SendRecipientPage } from "#/features/wallet/ui";

const searchSchema = z.object({
  /** Contract address of the token to preselect on the amount step. */
  token: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/wallet/send/")({
  validateSearch: searchSchema,
  component: SendRecipientRoute,
});

function SendRecipientRoute() {
  const { token } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <SendRecipientPage token={token} />
    </AuthenticatedRoute>
  );
}
