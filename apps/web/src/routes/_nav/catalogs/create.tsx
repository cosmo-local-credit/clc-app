import {
  catalogCreateIntentSchema,
  parseCatalogCreateSearch,
} from "@clc/core/features/catalogs/logic";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedRoute } from "#/components/auth/authenticated-route";
import { CatalogCreatePage } from "#/features/catalogs/ui/catalog-create-page";

export const Route = createFileRoute("/_nav/catalogs/create")({
  staticData: { navOwner: "wallet" },
  validateSearch: parseCatalogCreateSearch,
  component: CatalogCreateRoute,
});
function CatalogCreateRoute() {
  const parsed = catalogCreateIntentSchema.safeParse(Route.useSearch());
  return (
    <AuthenticatedRoute>
      <CatalogCreatePage intent={parsed.success ? parsed.data : undefined} />
    </AuthenticatedRoute>
  );
}
