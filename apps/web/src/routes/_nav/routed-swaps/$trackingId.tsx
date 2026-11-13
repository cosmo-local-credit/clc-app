import { createFileRoute, retainSearchParams } from "@tanstack/react-router";

import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { RoutedSwapReceiptPage } from "#/features/credit/ui";
import { creditDepthSearchParam } from "#/lib/navigation/credit-depth-search";

export const Route = createFileRoute("/_nav/routed-swaps/$trackingId")({
  staticData: { navOwner: "wallet" },
  validateSearch: z.object({ creditDepth: creditDepthSearchParam }),
  search: { middlewares: [retainSearchParams(["creditDepth"])] },
  component: RoutedSwapReceiptRoute,
});

function RoutedSwapReceiptRoute() {
  const { trackingId } = Route.useParams();
  return (
    <AuthenticatedRoute>
      <RoutedSwapReceiptPage trackingId={trackingId} />
    </AuthenticatedRoute>
  );
}
