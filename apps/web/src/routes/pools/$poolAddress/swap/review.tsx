import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { ReviewSwapPage } from "#/features/pools/ui";

const searchSchema = z.object({
  placeholder: z.boolean().optional().catch(undefined),
  payAmount: z.string().optional().catch(undefined),
  paySymbol: z.string().optional().catch(undefined),
  receiveAmount: z.string().optional().catch(undefined),
  receiveSymbol: z.string().optional().catch(undefined),
  voucherId: z.string().optional().catch(undefined),
  poolName: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/pools/$poolAddress/swap/review")({
  validateSearch: searchSchema,
  component: ReviewSwapRoute,
});

function ReviewSwapRoute() {
  const { poolAddress } = Route.useParams();
  const details = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <ReviewSwapPage poolAddress={poolAddress} details={details} />
    </AuthenticatedRoute>
  );
}
