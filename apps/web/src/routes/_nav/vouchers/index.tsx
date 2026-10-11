import { createFileRoute, redirect } from "@tanstack/react-router";

import { NearbyCatalog } from "#/components/nearby-catalog";
import { useAuthStatus } from "#/features/auth/hooks/use-auth-status";
import { MarketListPage } from "#/features/home/ui/market-list-page";
import {
  canonicalCreditableBrowseSearch,
  type CreditableBrowseSearch,
  pickCreditableBrowseSearch,
} from "#/lib/navigation/creditable-browse-search";
import { GUEST_STORAGE_OWNER } from "#/lib/storage/owner-tier-key";

export const Route = createFileRoute("/_nav/vouchers/")({
  staticData: { navOwner: "market" },
  validateSearch: (search): CreditableBrowseSearch => pickCreditableBrowseSearch(search),
  beforeLoad: ({ search }) => {
    const next = canonicalCreditableBrowseSearch(search);
    if (next) throw redirect({ to: "/vouchers", search: next, replace: true });
  },
  component: VouchersRoute,
});

function VouchersRoute() {
  const auth = useAuthStatus();
  const { creditable } = Route.useSearch();
  const owner =
    auth.isAuthenticated && auth.address ? auth.address.toLowerCase() : GUEST_STORAGE_OWNER;
  return (
    <NearbyCatalog>
      <MarketListPage creditableSearch={creditable} locationOwner={owner} />
    </NearbyCatalog>
  );
}
