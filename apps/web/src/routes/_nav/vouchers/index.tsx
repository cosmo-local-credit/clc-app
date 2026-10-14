import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  marketplaceSearchForScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";

export const Route = createFileRoute("/_nav/vouchers/")({
  staticData: { navOwner: "market" },
  validateSearch: pickMarketplaceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/market",
      search: marketplaceSearchForScope(search, "vouchers"),
      replace: true,
    });
  },
});
