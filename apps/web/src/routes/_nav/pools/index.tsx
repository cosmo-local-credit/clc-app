import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PoolsPage } from "#/features/pools/ui";
import {
  canonicalRedirectSearch,
  type CatalogRouteSearch,
  pickCatalogSearch,
} from "#/lib/navigation/catalog-search";

export const Route = createFileRoute("/_nav/pools/")({
  staticData: { navOwner: "wallet" },
  validateSearch: (search): CatalogRouteSearch => pickCatalogSearch(search),
  beforeLoad: ({ search }) => {
    const next = canonicalRedirectSearch(search, { voucherRelationships: true });
    if (!next) return;
    throw redirect({ to: "/pools", search: next, replace: true });
  },
  component: PoolsRoute,
});

function PoolsRoute() {
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background text-foreground pb-bottom-nav">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
          <PoolsPage />
        </main>
      </div>
    </AuthenticatedRoute>
  );
}
