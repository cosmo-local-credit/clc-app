import { NearbyCatalog } from "#/components/nearby-catalog";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { PoolsPage } from "#/features/pools/ui";
import {
  canonicalPoolRedirectSearch,
  type PoolRouteSearch,
  pickPoolSearch,
} from "#/lib/navigation/pool-search";

export const Route = createFileRoute("/_nav/pools/")({
  staticData: { navOwner: "wallet" },
  validateSearch: (search): PoolRouteSearch => pickPoolSearch(search),
  beforeLoad: ({ search }) => {
    const next = canonicalPoolRedirectSearch(search);
    if (!next) return;
    throw redirect({ to: "/pools", search: next, replace: true });
  },
  component: PoolsRoute,
});

function PoolsRoute() {
  const { creditable: creditableSearch, out_voucher: outputVoucherSearch } = Route.useSearch();
  return (
    <AuthenticatedRoute>
      <div className="min-h-[100svh] bg-background text-foreground pb-bottom-nav">
        <main className="px-6 pt-[calc(env(safe-area-inset-top)+0.875rem)]">
          <NearbyCatalog>
            <PoolsPage
              creditableSearch={creditableSearch}
              outputVoucherSearch={outputVoucherSearch}
            />
          </NearbyCatalog>
        </main>
      </div>
    </AuthenticatedRoute>
  );
}
