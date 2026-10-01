import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PoolDetailPage } from "#/features/pools/ui";

const searchSchema = z.object({
  tab: z
    .enum(["offerings", "vouchers", "holdings", "credit", "activity"])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/_nav/pools/$poolAddress/")({
  staticData: { navOwner: "wallet" },
  validateSearch: searchSchema,
  component: PoolDetailRoute,
});

function PoolDetailRoute() {
  const { poolAddress } = Route.useParams();
  const { tab } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background text-foreground pb-bottom-nav">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
          <PoolDetailPage poolAddress={poolAddress} activeTab={tab ?? "offerings"} />
        </main>
      </div>
    </AuthenticatedRoute>
  );
}
