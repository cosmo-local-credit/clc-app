import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SwapReceiptPage } from "#/features/pools/ui";

const searchSchema = z.object({
  placeholder: z.boolean().optional().catch(undefined),
  trackingId: z.string().optional().catch(undefined),
  receiveAmount: z.string().optional().catch(undefined),
  receiveSymbol: z.string().optional().catch(undefined),
  poolName: z.string().optional().catch(undefined),
  submittedAt: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/pools/$poolAddress/swap/receipt")({
  validateSearch: searchSchema,
  component: SwapReceiptRoute,
});

function SwapReceiptRoute() {
  const details = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <SwapReceiptPage details={details} />
    </AuthenticatedRoute>
  );
}
