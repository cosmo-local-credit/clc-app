import { createFileRoute } from "@tanstack/react-router";
import { CatalogDetailPage } from "#/features/catalogs/ui/catalog-detail-page";

export const Route = createFileRoute("/_nav/catalogs/$catalogId")({
  staticData: { navOwner: "wallet" },
  component: CatalogDetailRoute,
});
function CatalogDetailRoute() {
  return <CatalogDetailPage id={Route.useParams().catalogId} />;
}
