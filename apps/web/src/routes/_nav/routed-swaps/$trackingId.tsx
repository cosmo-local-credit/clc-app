import { createFileRoute, retainSearchParams } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { RoutedSwapReceiptPage } from "#/features/credit/ui";
import { creditSearch } from "#/lib/navigation/credit-search";

export const Route = createFileRoute("/_nav/routed-swaps/$trackingId")({
  staticData: { navOwner: "wallet" },
  validateSearch: creditSearch,
  search: { middlewares: [retainSearchParams(["credit"])] },
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
