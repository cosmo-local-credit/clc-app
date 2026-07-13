import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { TopUpPage } from "#/features/wallet/ui";

export const Route = createFileRoute("/wallet/top-up")({
  component: TopUpRoute,
});

function TopUpRoute() {
  return (
    <AuthenticatedRoute>
      <TopUpPage />
    </AuthenticatedRoute>
  );
}
