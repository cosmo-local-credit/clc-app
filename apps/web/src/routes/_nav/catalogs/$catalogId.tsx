import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { LayoutSwitch } from "#/desktop/switch";
import { CatalogDetailPage } from "#/features/catalogs/ui/catalog-detail-page";
import { useCatalogEditor } from "#/features/catalogs/hooks/use-catalog-editor";

const CatalogDesk = lazy(() =>
  import("#/desktop/catalogs/catalog-desk").then((module) => ({ default: module.CatalogDesk })),
);

export const Route = createFileRoute("/_nav/catalogs/$catalogId")({
  staticData: { navOwner: "wallet", desktop: "fill" },
  // `?edit` opens the editor in either layout, so Back closes it.
  validateSearch: (search: Record<string, unknown>): { edit?: true } =>
    search.edit === true || search.edit === "true" ? { edit: true } : {},
  component: CatalogDetailRoute,
});
function CatalogDetailRoute() {
  const id = Route.useParams().catalogId;
  const editor = useCatalogEditor();
  return (
    <LayoutSwitch
      mobile={<CatalogDetailPage id={id} editor={editor} />}
      desktop={<CatalogDesk id={id} editor={editor} />}
    />
  );
}
