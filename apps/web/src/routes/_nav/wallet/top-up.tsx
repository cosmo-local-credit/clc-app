import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { TopUpPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/_nav/wallet/top-up")({
  staticData: { navOwner: "wallet" },
  component: TopUpRoute,
});

function TopUpRoute() {
  return (
    <AuthenticatedRoute>
      <TopUpPage />
    </AuthenticatedRoute>
  );
}
