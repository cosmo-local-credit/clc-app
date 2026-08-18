import { createFileRoute } from "@tanstack/react-router";
import { OTXPage } from "#/features/transactions/otx-page";
import { parseOTXSearch } from "#/features/transactions/transactions-search";

export const Route = createFileRoute("/_shell/transactions/otx")({
  validateSearch: parseOTXSearch,
  component: () => <OTXPage search={Route.useSearch()} />,
});
