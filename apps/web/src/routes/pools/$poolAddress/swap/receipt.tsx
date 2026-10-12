import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { swapReceiptSearchSchema } from "#/features/pools/swap-receipt-search";
import { SwapReceiptPage } from "#/features/pools/ui";

export const Route = createFileRoute("/pools/$poolAddress/swap/receipt")({
  validateSearch: swapReceiptSearchSchema,
  component: SwapReceiptRoute,
});

function SwapReceiptRoute() {
  const { poolAddress } = Route.useParams();
  const details = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <SwapReceiptPage poolAddress={poolAddress} details={details} />
    </AuthenticatedRoute>
  );
}
