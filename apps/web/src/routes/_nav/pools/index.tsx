import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  marketplaceSearchForScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";

export const Route = createFileRoute("/_nav/pools/")({
  staticData: { navOwner: "market" },
  validateSearch: pickMarketplaceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/market",
      search: marketplaceSearchForScope(search, "pools"),
      replace: true,
    });
  },
});
