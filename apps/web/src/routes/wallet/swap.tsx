import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { SwapPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/swap")({
  component: SwapRoute,
});

function SwapRoute() {
  return (
    <AuthenticatedRoute>
      <SwapPage />
    </AuthenticatedRoute>
  );
}
