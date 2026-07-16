import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { BottomNavigation } from "#/features/home/ui/bottom-navigation";
import { PoolDetailPage } from "#/features/pools/ui";

export const Route = createFileRoute("/pools/$poolAddress/")({
  component: PoolDetailRoute,
});

function PoolDetailRoute() {
  const { poolAddress } = Route.useParams();
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background pb-[calc(4.75rem+env(safe-area-inset-bottom))] text-foreground">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <PoolDetailPage poolAddress={poolAddress} />
        </main>
        <BottomNavigation activeTab="pool" />
      </div>
    </AuthenticatedRoute>
  );
}
