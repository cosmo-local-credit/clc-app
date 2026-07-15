import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PoolSwapPage } from "#/features/pools/ui";

export const Route = createFileRoute("/pools/$poolAddress/swap")({
  component: PoolSwapRoute,
});

function PoolSwapRoute() {
  const { poolAddress } = Route.useParams();
  return (
    <AuthenticatedRoute>
      <PoolSwapPage poolAddress={poolAddress} />
    </AuthenticatedRoute>
  );
}
