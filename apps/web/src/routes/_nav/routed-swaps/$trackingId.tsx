import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { RoutedSwapReceiptPage } from "#/features/credit/ui";

export const Route = createFileRoute("/_nav/routed-swaps/$trackingId")({
  staticData: { navOwner: "wallet" },
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
