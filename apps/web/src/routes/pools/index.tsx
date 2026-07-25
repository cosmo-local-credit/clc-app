import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PoolsPage } from "#/features/pools/ui";

export const Route = createFileRoute("/pools/")({
  component: PoolsRoute,
});

function PoolsRoute() {
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background text-foreground">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <PoolsPage />
        </main>
      </div>
    </AuthenticatedRoute>
  );
}
