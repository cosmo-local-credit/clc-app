import {
  catalogCreateIntentSchema,
  parseCatalogCreateSearch,
} from "@clc/core/features/catalogs/logic";
import { createFileRoute } from "@tanstack/react-router";
import { lazy } from "react";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { LayoutSwitch } from "#/desktop/switch";
import { CatalogCreatePage } from "#/features/catalogs/ui/catalog-create-page";

const CatalogCreateDesk = lazy(() =>
  import("#/desktop/catalogs/catalog-create-desk").then((module) => ({
    default: module.CatalogCreateDesk,
  })),
);

export const Route = createFileRoute("/catalogs/create")({
  staticData: { desktop: "fill" },
  validateSearch: parseCatalogCreateSearch,
  component: CatalogCreateRoute,
});
function CatalogCreateRoute() {
  const parsed = catalogCreateIntentSchema.safeParse(Route.useSearch());
  const intent = parsed.success ? parsed.data : undefined;
  return (
    <AuthenticatedRoute>
      <LayoutSwitch
        mobile={<CatalogCreatePage intent={intent} />}
        desktop={<CatalogCreateDesk intent={intent} />}
      />
    </AuthenticatedRoute>
  );
}
