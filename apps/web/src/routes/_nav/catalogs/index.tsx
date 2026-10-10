import { createFileRoute } from "@tanstack/react-router";
import { CatalogsPage } from "#/features/catalogs/ui/catalogs-page";

export const Route = createFileRoute("/_nav/catalogs/")({
  staticData: { navOwner: "wallet" },
  component: CatalogsPage,
});
