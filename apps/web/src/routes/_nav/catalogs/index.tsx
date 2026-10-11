import { createFileRoute, redirect } from "@tanstack/react-router";
import { CatalogsPage } from "#/features/catalogs/ui/catalogs-page";
import {
  canonicalRedirectSearch,
  type CatalogRouteSearch,
  pickCatalogSearch,
} from "#/lib/navigation/catalog-search";

export const Route = createFileRoute("/_nav/catalogs/")({
  staticData: { navOwner: "wallet" },
  validateSearch: (search): CatalogRouteSearch => {
    const { q } = pickCatalogSearch(search);
    return q === undefined ? {} : { q };
  },
  beforeLoad: ({ search }) => {
    const next = canonicalRedirectSearch(search, { voucherRelationships: false });
    if (next) throw redirect({ to: "/catalogs", search: { q: next.q }, replace: true });
  },
  component: CatalogsPage,
});
