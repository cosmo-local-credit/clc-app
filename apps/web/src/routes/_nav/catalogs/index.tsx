import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  marketplaceSearchForScope,
  pickMarketplaceSearch,
} from "#/lib/navigation/marketplace-search";

export const Route = createFileRoute("/_nav/catalogs/")({
  staticData: { navOwner: "market" },
  validateSearch: pickMarketplaceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/market",
      search: marketplaceSearchForScope(search, "catalogs"),
      replace: true,
    });
  },
});
