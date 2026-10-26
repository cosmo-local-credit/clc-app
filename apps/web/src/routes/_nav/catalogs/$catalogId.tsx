import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { LayoutSwitch } from "#/desktop/switch";
import { CatalogDetailPage } from "#/features/catalogs/ui/catalog-detail-page";

const CatalogDesk = lazy(() =>
  import("#/desktop/catalogs/catalog-desk").then((module) => ({ default: module.CatalogDesk })),
);

export const Route = createFileRoute("/_nav/catalogs/$catalogId")({
  staticData: { navOwner: "wallet", desktop: "fill" },
  component: CatalogDetailRoute,
});
function CatalogDetailRoute() {
  const id = Route.useParams().catalogId;
  return <LayoutSwitch mobile={<CatalogDetailPage id={id} />} desktop={<CatalogDesk id={id} />} />;
}
